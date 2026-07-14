import { TRPCError } from "@trpc/server";
import { db } from "@valkoinenmonsterv2/db";
import {
	bucketCans,
	trackServerEvent,
} from "@valkoinenmonsterv2/db/rybbit-track";
import { user } from "@valkoinenmonsterv2/db/schema/auth";
import {
	type GameStateRow,
	gameState,
} from "@valkoinenmonsterv2/db/schema/game";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	acceptManualClicks,
	calculateClickValue,
	calculateIdleGain,
	clampGameValue,
	createInitialGoldenUpgrades,
	createInitialProducers,
	FRENZY_DURATION_MS,
	FRENZY_MULTIPLIER,
	type GameProgress,
	type GameSnapshot,
	GOLDEN_UPGRADES,
	type GoldenUpgradeRanks,
	getGoldenUpgrade,
	getRunUpgrade,
	goldenUpgradeCost,
	isGoldenUpgradeId,
	isProducerId,
	isRunUpgradeId,
	PRODUCERS,
	type ProducerCounts,
	prestigeRequirement,
	prestigeReward,
	producerCost,
	randomFrenzyThreshold,
} from "../game";
import { protectedProcedure, router } from "../index";

const OFFLINE_AFTER_MS = 15_000;

const mutationInput = z.object({
	operationId: z.uuid(),
	pendingManualClicks: z.number().int().min(0).max(10_000),
	revision: z.number().int().nonnegative(),
});

export type MutationInput = z.infer<typeof mutationInput>;
export type MutableGameState = Omit<
	GameStateRow,
	"producers" | "goldenUpgrades"
> &
	GameProgress;
type GameMutation = (state: MutableGameState, now: Date) => MutableGameState;

const secureRandom = (): number => {
	const values = new Uint32Array(1);
	crypto.getRandomValues(values);
	return (values[0] ?? 0) / 2 ** 32;
};

const normalizeProducers = (value: Record<string, number>): ProducerCounts => {
	const producers = createInitialProducers();
	for (const producer of PRODUCERS) {
		const owned = value[producer.id];
		if (Number.isFinite(owned) && owned !== undefined) {
			producers[producer.id] = Math.max(0, Math.floor(owned));
		}
	}
	return producers;
};

const normalizeGoldenUpgrades = (
	value: Record<string, number>
): GoldenUpgradeRanks => {
	const upgrades = createInitialGoldenUpgrades();
	for (const upgrade of GOLDEN_UPGRADES) {
		const rank = value[upgrade.id];
		if (Number.isFinite(rank) && rank !== undefined) {
			upgrades[upgrade.id] = Math.min(
				upgrade.maxRank,
				Math.max(0, Math.floor(rank))
			);
		}
	}
	return upgrades;
};

const normalizeState = (state: GameStateRow): MutableGameState => ({
	...state,
	goldenUpgrades: normalizeGoldenUpgrades(state.goldenUpgrades),
	producers: normalizeProducers(state.producers),
	runUpgrades: state.runUpgrades.filter(isRunUpgradeId),
});

export const createDefaultGameState = (userId: string, now: Date) => {
	const progress: GameProgress = {
		goldenUpgrades: createInitialGoldenUpgrades(),
		producers: createInitialProducers(),
		runUpgrades: [],
	};
	return {
		bestRunCans: 0,
		cans: 0,
		goldenCans: 0,
		lifetimeCans: 0,
		prestigeLevel: 0,
		runCans: 0,
		totalGoldenCans: 0,
		userId,
		...progress,
		createdAt: now,
		frenzyEndsAt: null,
		lastAccruedAt: now,
		lastOperationId: null,
		manualClickBudget: 20,
		nextFrenzyClick: randomFrenzyThreshold(progress, secureRandom()),
		revision: 0,
		shadowBanned: false,
		updatedAt: now,
	};
};

const ensureGameState = async (userId: string): Promise<GameStateRow> => {
	const now = new Date();
	const [inserted] = await db
		.insert(gameState)
		.values(createDefaultGameState(userId, now))
		.onConflictDoNothing()
		.returning();
	if (inserted) {
		return inserted;
	}
	const [existing] = await db
		.select()
		.from(gameState)
		.where(eq(gameState.userId, userId))
		.limit(1);
	if (!existing) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Game save unavailable",
		});
	}
	return existing;
};

const addCans = (state: MutableGameState, amount: number): MutableGameState => {
	const safeAmount = clampGameValue(amount);
	return {
		...state,
		bestRunCans: clampGameValue(
			Math.max(state.bestRunCans, state.runCans + safeAmount)
		),
		cans: clampGameValue(state.cans + safeAmount),
		lifetimeCans: clampGameValue(state.lifetimeCans + safeAmount),
		runCans: clampGameValue(state.runCans + safeAmount),
	};
};

export const accrueState = (
	state: MutableGameState,
	pendingManualClicks: number,
	now: Date
): MutableGameState => {
	const nowMs = now.getTime();
	const previousMs = state.lastAccruedAt.getTime();
	const elapsedMs = Math.max(0, nowMs - previousMs);
	const { acceptedClicks, remainingBudget } = acceptManualClicks(
		state.manualClickBudget,
		elapsedMs,
		pendingManualClicks
	);
	const frenzyEndMs = state.frenzyEndsAt?.getTime() ?? 0;
	const frenzyIdleMs = Math.max(0, Math.min(nowMs, frenzyEndMs) - previousMs);
	const offlineMultiplier =
		elapsedMs >= OFFLINE_AFTER_MS && state.goldenUpgrades["time-capsule"] > 0
			? 2
			: 1;
	const idleGain = calculateIdleGain(
		state,
		elapsedMs,
		frenzyIdleMs,
		offlineMultiplier
	);
	const isFrenzyActive = frenzyEndMs > nowMs;
	const clickGain =
		acceptedClicks *
		calculateClickValue(state) *
		(isFrenzyActive ? FRENZY_MULTIPLIER : 1);
	let nextState = addCans(state, idleGain + clickGain);
	let { nextFrenzyClick } = state;
	let frenzyEndsAt =
		state.frenzyEndsAt && frenzyEndMs > nowMs ? state.frenzyEndsAt : null;

	if (!isFrenzyActive && acceptedClicks >= nextFrenzyClick) {
		frenzyEndsAt = new Date(nowMs + FRENZY_DURATION_MS);
		nextFrenzyClick = randomFrenzyThreshold(nextState, secureRandom());
	} else if (!isFrenzyActive) {
		nextFrenzyClick -= acceptedClicks;
	}

	nextState = {
		...nextState,
		frenzyEndsAt,
		lastAccruedAt: now,
		manualClickBudget: remainingBudget,
		nextFrenzyClick,
	};
	return nextState;
};

const toSnapshot = (
	state: MutableGameState,
	isAnonymous: boolean,
	serverNow: number
): GameSnapshot => ({
	bestRunCans: state.bestRunCans,
	cans: state.cans,
	frenzyEndsAt: state.frenzyEndsAt?.getTime() ?? null,
	goldenCans: state.goldenCans,
	goldenUpgrades: state.goldenUpgrades,
	isAnonymous,
	isShadowBanned: state.shadowBanned,
	lastAccruedAt: state.lastAccruedAt.getTime(),
	lifetimeCans: state.lifetimeCans,
	nextFrenzyClick: state.nextFrenzyClick,
	prestigeLevel: state.prestigeLevel,
	producers: state.producers,
	revision: state.revision,
	runCans: state.runCans,
	runUpgrades: state.runUpgrades,
	serverNow,
	totalGoldenCans: state.totalGoldenCans,
});

const mutateGameState = async (
	userId: string,
	isAnonymous: boolean,
	input: MutationInput,
	mutation: GameMutation = (state) => state
): Promise<GameSnapshot> => {
	const current = normalizeState(await ensureGameState(userId));
	const serverNow = Date.now();
	const disposition = getMutationDisposition(current, input);
	if (disposition === "retry") {
		return toSnapshot(current, isAnonymous, serverNow);
	}

	const now = new Date(serverNow);
	const accrued = accrueState(current, input.pendingManualClicks, now);
	const mutated = mutation(accrued, now);
	const [saved] = await db
		.update(gameState)
		.set({
			...mutated,
			lastOperationId: input.operationId,
			revision: current.revision + 1,
			updatedAt: now,
		})
		.where(
			and(
				eq(gameState.userId, userId),
				eq(gameState.revision, current.revision)
			)
		)
		.returning();
	if (!saved) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Game state changed; reloading save",
		});
	}
	return toSnapshot(normalizeState(saved), isAnonymous, serverNow);
};

export const getMutationDisposition = (
	state: Pick<MutableGameState, "lastOperationId" | "revision">,
	input: Pick<MutationInput, "operationId" | "revision">
): "apply" | "retry" => {
	if (state.lastOperationId === input.operationId) {
		return "retry";
	}
	if (state.revision !== input.revision) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Game state changed; reloading save",
		});
	}
	return "apply";
};

const getGameState = async (
	userId: string,
	isAnonymous: boolean
): Promise<GameSnapshot> => {
	const current = await ensureGameState(userId);
	return mutateGameState(
		userId,
		isAnonymous,
		{
			operationId: crypto.randomUUID(),
			pendingManualClicks: 0,
			revision: current.revision,
		},
		(state) => state
	);
};

const insufficientFunds = () =>
	new TRPCError({
		code: "BAD_REQUEST",
		message: "Not enough cans for that upgrade",
	});

export const buyProducer = (producerId: string): GameMutation => {
	if (!isProducerId(producerId)) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown producer" });
	}
	return (state) => {
		const cost = producerCost(producerId, state.producers[producerId]);
		if (state.cans < cost) {
			throw insufficientFunds();
		}
		return {
			...state,
			cans: state.cans - cost,
			producers: {
				...state.producers,
				[producerId]: state.producers[producerId] + 1,
			},
		};
	};
};

export const buyUpgrade = (upgradeId: string): GameMutation => {
	if (isGoldenUpgradeId(upgradeId)) {
		return (state) => {
			const upgrade = getGoldenUpgrade(upgradeId);
			if (!upgrade) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown golden upgrade",
				});
			}
			const rank = state.goldenUpgrades[upgradeId];
			if (
				state.prestigeLevel < upgrade.unlockLevel ||
				rank >= upgrade.maxRank
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Golden upgrade is locked",
				});
			}
			const cost = goldenUpgradeCost(upgradeId, rank);
			if (state.goldenCans < cost) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Not enough golden cans",
				});
			}
			return {
				...state,
				goldenCans: state.goldenCans - cost,
				goldenUpgrades: { ...state.goldenUpgrades, [upgradeId]: rank + 1 },
			};
		};
	}
	const upgrade = getRunUpgrade(upgradeId);
	if (!upgrade) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown upgrade" });
	}
	return (state) => {
		const producerOwned = upgrade.producerId
			? state.producers[upgrade.producerId]
			: 0;
		const isLocked =
			state.runUpgrades.includes(upgrade.id) ||
			(upgrade.requiredOwned !== undefined &&
				producerOwned < upgrade.requiredOwned);
		if (isLocked) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Upgrade is locked",
			});
		}
		if (state.cans < upgrade.cost) {
			throw insufficientFunds();
		}
		return {
			...state,
			cans: state.cans - upgrade.cost,
			runUpgrades: [...state.runUpgrades, upgrade.id],
		};
	};
};

export const prestige: GameMutation = (state) => {
	const requirement = prestigeRequirement(state.prestigeLevel);
	const reward = prestigeReward(state.runCans, state.prestigeLevel);
	if (state.runCans < requirement || reward < 1) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Prestige is not ready",
		});
	}
	const nextProgress: GameProgress = {
		goldenUpgrades: state.goldenUpgrades,
		producers: createInitialProducers(),
		runUpgrades: [],
	};
	return {
		...state,
		...nextProgress,
		bestRunCans: Math.max(state.bestRunCans, state.runCans),
		cans: 0,
		frenzyEndsAt: null,
		goldenCans: state.goldenCans + reward,
		nextFrenzyClick: randomFrenzyThreshold(nextProgress, secureRandom()),
		prestigeLevel: state.prestigeLevel + 1,
		runCans: 0,
		totalGoldenCans: state.totalGoldenCans + reward,
	};
};

const sessionIsAnonymous = (session: {
	user: { isAnonymous?: boolean | null };
}): boolean => Boolean(session.user.isAnonymous);

export const gameRouter = router({
	buyProducer: protectedProcedure
		.input(mutationInput.extend({ producerId: z.string() }))
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				buyProducer(input.producerId)
			)
		),
	buyUpgrade: protectedProcedure
		.input(mutationInput.extend({ upgradeId: z.string() }))
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				buyUpgrade(input.upgradeId)
			)
		),
	getState: protectedProcedure.query(({ ctx }) =>
		getGameState(ctx.session.user.id, sessionIsAnonymous(ctx.session))
	),
	prestige: protectedProcedure
		.input(mutationInput)
		.mutation(async ({ ctx, input }) => {
			const before = normalizeState(await ensureGameState(ctx.session.user.id));
			const requirement = prestigeRequirement(before.prestigeLevel);
			const reward = prestigeReward(before.runCans, before.prestigeLevel);
			const snapshot = await mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				prestige
			);
			trackServerEvent(
				"game.prestige.completed",
				{
					prestige_level_before: before.prestigeLevel,
					requirement,
					reward_golden_cans: reward,
					run_cans_bucket: bucketCans(before.runCans),
				},
				ctx.session.user.id
			).catch(() => undefined);
			return snapshot;
		}),
	sync: protectedProcedure
		.input(mutationInput)
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input
			)
		),
	triggerFrenzy: protectedProcedure
		.input(mutationInput)
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input
			)
		),
});

export interface LeaderboardRow {
	createdAt: Date;
	lifetimeCans: number;
	name: string;
	prestigeLevel: number;
	userId: string;
}

export const rankLeaderboard = (rows: LeaderboardRow[]) =>
	[...rows]
		.sort(
			(left, right) =>
				right.lifetimeCans - left.lifetimeCans ||
				left.createdAt.getTime() - right.createdAt.getTime()
		)
		.slice(0, 50)
		.map(({ userId, name, lifetimeCans, prestigeLevel }, index) => ({
			lifetimeCans,
			name,
			prestigeLevel,
			rank: index + 1,
			userId,
		}));

export const leaderboardForViewer = (
	publicRows: LeaderboardRow[],
	viewer?: LeaderboardRow & { shadowBanned: boolean }
) =>
	viewer?.shadowBanned
		? rankLeaderboard([...publicRows, viewer])
		: rankLeaderboard(publicRows);

export const leaderboardRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const publicRows = await db
			.select({
				createdAt: user.createdAt,
				lifetimeCans: gameState.lifetimeCans,
				name: user.name,
				prestigeLevel: gameState.prestigeLevel,
				userId: user.id,
			})
			.from(gameState)
			.innerJoin(user, eq(gameState.userId, user.id))
			.where(
				and(eq(gameState.shadowBanned, false), eq(user.isAnonymous, false))
			)
			.orderBy(desc(gameState.lifetimeCans), asc(user.createdAt))
			.limit(50);

		if (sessionIsAnonymous(ctx.session)) {
			return rankLeaderboard(publicRows);
		}
		const [viewer] = await db
			.select({
				createdAt: user.createdAt,
				lifetimeCans: gameState.lifetimeCans,
				name: user.name,
				prestigeLevel: gameState.prestigeLevel,
				shadowBanned: gameState.shadowBanned,
				userId: user.id,
			})
			.from(gameState)
			.innerJoin(user, eq(gameState.userId, user.id))
			.where(eq(gameState.userId, ctx.session.user.id))
			.limit(1);
		return leaderboardForViewer(publicRows, viewer);
	}),
});
