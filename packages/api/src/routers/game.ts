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
	calculateCps,
	calculateIdleGain,
	cheapestAffordableProducer,
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
	OFFLINE_PRODUCTION_MULTIPLIER,
	PRODUCERS,
	type ProducerCounts,
	prestigeRequirement,
	prestigeReward,
	producerCost,
	RUN_UPGRADES,
	randomFrenzyThreshold,
} from "../game";
import { protectedProcedure, router } from "../index";

const OFFLINE_AFTER_MS = 15_000;
const AGENT_HEARTBEAT_MS = 5000;
const MAX_AGENT_WAIT_MS = 60 * 60 * 1000;

const mutationInput = z.object({
	operationId: z.uuid(),
	pendingManualClicks: z.number().int().min(0).max(10_000),
	revision: z.number().int().nonnegative(),
});

const agentOperationId = { operationId: z.uuid() };

export const agentGameCommandSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("observe") }).strict(),
	z
		.object({
			action: z.literal("click"),
			count: z.number().int().min(1).max(10_000),
			...agentOperationId,
		})
		.strict(),
	z
		.object({
			action: z.literal("buy_producer"),
			producerId: z.string(),
			...agentOperationId,
		})
		.strict(),
	z
		.object({
			action: z.literal("buy_upgrade"),
			upgradeId: z.string(),
			...agentOperationId,
		})
		.strict(),
	z
		.object({
			action: z.literal("wait"),
			milliseconds: z.number().int().min(1).max(MAX_AGENT_WAIT_MS),
			...agentOperationId,
		})
		.strict(),
	z.object({ action: z.literal("prestige"), ...agentOperationId }).strict(),
	z
		.object({
			action: z.literal("reset"),
			confirm: z.literal("RESET"),
			...agentOperationId,
		})
		.strict(),
]);

export type MutationInput = z.infer<typeof mutationInput>;
export type AgentGameCommand = z.infer<typeof agentGameCommandSchema>;
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

const accrueStateWithResult = (
	state: MutableGameState,
	pendingManualClicks: number,
	now: Date
): { acceptedClicks: number; state: MutableGameState } => {
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
		elapsedMs >= OFFLINE_AFTER_MS
			? OFFLINE_PRODUCTION_MULTIPLIER *
				(state.goldenUpgrades["time-capsule"] > 0 ? 2 : 1)
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
	return { acceptedClicks, state: nextState };
};

export const accrueState = (
	state: MutableGameState,
	pendingManualClicks: number,
	now: Date
): MutableGameState =>
	accrueStateWithResult(state, pendingManualClicks, now).state;

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
	idleReport: null,
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

interface GameMutationResult {
	acceptedClicks: number;
	replayed: boolean;
	snapshot: GameSnapshot;
	state: MutableGameState;
}

const mutateGameStateWithState = async (
	userId: string,
	isAnonymous: boolean,
	input: MutationInput,
	mutation: GameMutation = (state) => state,
	reportIdle = false
): Promise<GameMutationResult> => {
	const current = normalizeState(await ensureGameState(userId));
	const serverNow = Date.now();
	const disposition = getMutationDisposition(current, input);
	if (disposition === "retry") {
		return {
			acceptedClicks: 0,
			replayed: true,
			snapshot: toSnapshot(current, isAnonymous, serverNow),
			state: current,
		};
	}

	const now = new Date(serverNow);
	const accrual = accrueStateWithResult(
		current,
		input.pendingManualClicks,
		now
	);
	const mutated = mutation(accrual.state, now);
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
	const normalized = normalizeState(saved);
	let snapshot = toSnapshot(normalized, isAnonymous, serverNow);
	const idleElapsedMs = serverNow - current.lastAccruedAt.getTime();
	if (reportIdle && idleElapsedMs >= OFFLINE_AFTER_MS) {
		snapshot = {
			...snapshot,
			idleReport: {
				cansEarned: Math.max(0, snapshot.lifetimeCans - current.lifetimeCans),
				elapsedMs: idleElapsedMs,
				hadFrenzy:
					current.frenzyEndsAt !== null &&
					current.frenzyEndsAt.getTime() > current.lastAccruedAt.getTime(),
			},
		};
	}
	return {
		acceptedClicks: accrual.acceptedClicks,
		replayed: false,
		snapshot,
		state: normalized,
	};
};

const mutateGameState = async (
	userId: string,
	isAnonymous: boolean,
	input: MutationInput,
	mutation: GameMutation = (state) => state,
	reportIdle = false
): Promise<GameSnapshot> =>
	(
		await mutateGameStateWithState(
			userId,
			isAnonymous,
			input,
			mutation,
			reportIdle
		)
	).snapshot;

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
		(state) => state,
		true
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

export const advanceOpenState = (
	state: MutableGameState,
	milliseconds: number,
	now: Date
): MutableGameState => {
	let nextState = state;
	let remainingMs = milliseconds;
	let simulatedNow = now.getTime();

	while (remainingMs >= AGENT_HEARTBEAT_MS) {
		simulatedNow += AGENT_HEARTBEAT_MS;
		nextState = accrueState(nextState, 0, new Date(simulatedNow));
		if (nextState.goldenUpgrades["smart-stocker"] > 0) {
			const producerId = cheapestAffordableProducer(nextState, nextState.cans);
			if (producerId) {
				nextState = buyProducer(producerId)(nextState, new Date(simulatedNow));
			}
		}
		remainingMs -= AGENT_HEARTBEAT_MS;
	}

	if (remainingMs > 0) {
		simulatedNow += remainingMs;
		nextState = accrueState(nextState, 0, new Date(simulatedNow));
	}

	const frenzyRemainingMs = Math.max(
		0,
		(nextState.frenzyEndsAt?.getTime() ?? 0) - simulatedNow
	);
	return {
		...nextState,
		frenzyEndsAt:
			frenzyRemainingMs > 0
				? new Date(now.getTime() + frenzyRemainingMs)
				: null,
		lastAccruedAt: now,
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
	const requirement = prestigeRequirement(state.totalGoldenCans);
	const reward = prestigeReward(state.runCans, state.totalGoldenCans);
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

export const resetGameState = (
	state: MutableGameState,
	now: Date
): MutableGameState => ({
	...createDefaultGameState(state.userId, now),
	createdAt: state.createdAt,
	revision: state.revision,
	shadowBanned: state.shadowBanned,
});

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
			const requirement = prestigeRequirement(before.totalGoldenCans);
			const reward = prestigeReward(before.runCans, before.totalGoldenCans);
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

const getLeaderboard = async (userId: string, isAnonymous: boolean) => {
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
		.where(and(eq(gameState.shadowBanned, false), eq(user.isAnonymous, false)))
		.orderBy(desc(gameState.lifetimeCans), asc(user.createdAt))
		.limit(50);

	if (isAnonymous) {
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
		.where(eq(gameState.userId, userId))
		.limit(1);
	return leaderboardForViewer(publicRows, viewer);
};

export const leaderboardRouter = router({
	list: protectedProcedure.query(({ ctx }) =>
		getLeaderboard(ctx.session.user.id, sessionIsAnonymous(ctx.session))
	),
});

export interface AgentGameActionResult {
	acceptedClicks?: number;
	action: AgentGameCommand["action"];
	advancedMilliseconds?: number;
	producerId?: string;
	rejectedClicks?: number;
	replayed: boolean;
	upgradeId?: string;
}

export const createAgentGameObservation = (
	state: MutableGameState,
	snapshot: GameSnapshot,
	leaderboard: ReturnType<typeof rankLeaderboard>,
	result: AgentGameActionResult
) => {
	const frenzyActive = (snapshot.frenzyEndsAt ?? 0) > snapshot.serverNow;
	const clickValue = calculateClickValue(state);
	const manualClicksAvailable = Math.floor(state.manualClickBudget);
	const requirement = prestigeRequirement(state.totalGoldenCans);
	const reward = prestigeReward(state.runCans, state.totalGoldenCans);
	const producers = PRODUCERS.map((producer) => {
		const owned = state.producers[producer.id];
		const cost = producerCost(producer.id, owned);
		return {
			affordable: state.cans >= cost,
			baseCps: producer.baseCps,
			cost,
			id: producer.id,
			name: producer.name,
			owned,
		};
	});
	const runUpgrades = RUN_UPGRADES.map((upgrade) => {
		const producerOwned = upgrade.producerId
			? state.producers[upgrade.producerId]
			: 0;
		const owned = state.runUpgrades.includes(upgrade.id);
		const unlocked =
			upgrade.requiredOwned === undefined ||
			producerOwned >= upgrade.requiredOwned;
		return {
			affordable: !owned && unlocked && state.cans >= upgrade.cost,
			cost: upgrade.cost,
			description: upgrade.description,
			id: upgrade.id,
			name: upgrade.name,
			owned,
			producerId: upgrade.producerId ?? null,
			requiredOwned: upgrade.requiredOwned ?? null,
			unlocked,
		};
	});
	const goldenUpgrades = GOLDEN_UPGRADES.map((upgrade) => {
		const rank = state.goldenUpgrades[upgrade.id];
		const cost = goldenUpgradeCost(upgrade.id, rank);
		const maxed = rank >= upgrade.maxRank;
		const unlocked = state.prestigeLevel >= upgrade.unlockLevel;
		return {
			affordable: !maxed && unlocked && state.goldenCans >= cost,
			cost,
			description: upgrade.description,
			id: upgrade.id,
			maxed,
			maxRank: upgrade.maxRank,
			name: upgrade.name,
			rank,
			unlocked,
			unlockLevel: upgrade.unlockLevel,
		};
	});
	const legalActions: AgentGameCommand[] = [{ action: "observe" }];
	if (manualClicksAvailable > 0) {
		legalActions.push({
			action: "click",
			count: manualClicksAvailable,
			operationId: crypto.randomUUID(),
		});
	}
	legalActions.push({
		action: "wait",
		milliseconds: AGENT_HEARTBEAT_MS,
		operationId: crypto.randomUUID(),
	});
	for (const producer of producers) {
		if (producer.affordable) {
			legalActions.push({
				action: "buy_producer",
				operationId: crypto.randomUUID(),
				producerId: producer.id,
			});
		}
	}
	for (const upgrade of [...runUpgrades, ...goldenUpgrades]) {
		if (upgrade.affordable) {
			legalActions.push({
				action: "buy_upgrade",
				operationId: crypto.randomUUID(),
				upgradeId: upgrade.id,
			});
		}
	}
	if (state.runCans >= requirement && reward > 0) {
		legalActions.push({
			action: "prestige",
			operationId: crypto.randomUUID(),
		});
	}
	legalActions.push({
		action: "reset",
		confirm: "RESET",
		operationId: crypto.randomUUID(),
	});

	return {
		leaderboard: leaderboard.slice(0, 10),
		legalActions,
		result,
		shop: { goldenUpgrades, producers, runUpgrades },
		state: snapshot,
		stats: {
			baseClickValue: clickValue,
			cansPerSecond: calculateCps(state),
			effectiveClickValue: clickValue * (frenzyActive ? FRENZY_MULTIPLIER : 1),
			frenzy: {
				active: frenzyActive,
				clicksUntilNext: state.nextFrenzyClick,
				multiplier: frenzyActive ? FRENZY_MULTIPLIER : 1,
				remainingMilliseconds: frenzyActive
					? Math.max(0, (snapshot.frenzyEndsAt ?? 0) - snapshot.serverNow)
					: 0,
			},
			manualClicksAvailable,
			prestige: {
				ready: state.runCans >= requirement && reward > 0,
				requirement,
				reward,
			},
		},
	};
};

const mutationForAgentCommand = (command: AgentGameCommand): GameMutation => {
	if (command.action === "buy_producer") {
		return buyProducer(command.producerId);
	}
	if (command.action === "buy_upgrade") {
		return buyUpgrade(command.upgradeId);
	}
	if (command.action === "wait") {
		return (state, now) => advanceOpenState(state, command.milliseconds, now);
	}
	if (command.action === "prestige") {
		return prestige;
	}
	if (command.action === "reset") {
		return resetGameState;
	}
	return (state) => state;
};

const resultForAgentCommand = (
	command: AgentGameCommand,
	mutationResult: GameMutationResult
): AgentGameActionResult => {
	const base = {
		action: command.action,
		replayed: mutationResult.replayed,
	};
	if (command.action === "click") {
		return mutationResult.replayed
			? base
			: {
					...base,
					acceptedClicks: mutationResult.acceptedClicks,
					rejectedClicks: command.count - mutationResult.acceptedClicks,
				};
	}
	if (command.action === "wait") {
		return {
			...base,
			advancedMilliseconds: mutationResult.replayed ? 0 : command.milliseconds,
		};
	}
	if (command.action === "buy_producer") {
		return { ...base, producerId: command.producerId };
	}
	if (command.action === "buy_upgrade") {
		return { ...base, upgradeId: command.upgradeId };
	}
	return base;
};

export const runAgentGameCommand = async (
	userId: string,
	isAnonymous: boolean,
	command: AgentGameCommand
) => {
	const current = await ensureGameState(userId);
	const mutationResult = await mutateGameStateWithState(
		userId,
		isAnonymous,
		{
			operationId:
				command.action === "observe"
					? crypto.randomUUID()
					: command.operationId,
			pendingManualClicks: command.action === "click" ? command.count : 0,
			revision: current.revision,
		},
		mutationForAgentCommand(command),
		command.action === "observe"
	);
	const leaderboard = await getLeaderboard(userId, isAnonymous);
	return createAgentGameObservation(
		mutationResult.state,
		mutationResult.snapshot,
		leaderboard,
		resultForAgentCommand(command, mutationResult)
	);
};
