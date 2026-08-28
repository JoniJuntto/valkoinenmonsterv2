import { TRPCError } from "@trpc/server";
import { type Database, db } from "@valkoinenmonsterv2/db";
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
	ALL_PRODUCERS,
	ASCENSION_NODES,
	ASCENSION_WIND_SECONDS,
	type AscensionNodeId,
	acceptManualClicks,
	activeFrenzyMultiplier,
	activeWall,
	ascensionNodeCost,
	ascensionNodeUnlocked,
	ascensionPotential,
	ascensionReward,
	bestStockerPurchase,
	CLICK_RUSH_MULTIPLIER,
	calculateClickValue,
	calculateCps,
	calculateIdleGain,
	clampGameCounter,
	clampGameValue,
	collectUnlockedVariants,
	coolantPerSecond,
	coolingTowerCost,
	createHeadStartProducers,
	createInitialAscensionNodes,
	createInitialGoldenUpgrades,
	createInitialProducers,
	createStartingRunUpgrades,
	DRAFT_SIZE,
	FLAVOR_UPGRADES,
	FRENZY_STACK_BONUS,
	frenzyDurationMs,
	type GameProgress,
	type GameSnapshot,
	GOLDEN_RUSH_CLAIM_WINDOW_MS,
	GOLDEN_UPGRADES,
	type GoldenRushReward,
	getAscensionNode,
	getGoldenUpgrade,
	getRunUpgrade,
	goldenUpgradeCost,
	goldenUpgradeUnlockLevel,
	isAscensionNodeId,
	isDraftOnlyKind,
	isGoldenUpgradeId,
	isProducerId,
	isWorldUnlocked,
	MAX_FRENZY_STACKS,
	nextGoldenCanRequirement,
	OFFLINE_ACCRUAL_THRESHOLD_MS,
	offlineProductionMultiplier,
	PRODUCER_SYNERGIES,
	PRODUCTION_FRENZY_MULTIPLIER,
	prestigeReward,
	producerBulkCost,
	producerCost,
	RUN_UPGRADES,
	type RunUpgradeDefinition,
	randomFrenzyThreshold,
	rollDraftOptions,
	rollGoldenRushDelayMs,
	rollGoldenRushDrop,
	rollGoldenRushReward,
	unionCollection,
	unlockedAchievementIds,
	worldOfProducer,
} from "../game";
import {
	assertProgressionInvariants,
	type MutableGameState,
	normalizePersistedGameState,
} from "../game-state";
import { protectedProcedure, router } from "../index";

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
			action: z.literal("pick_draft"),
			optionIndex: z
				.number()
				.int()
				.min(0)
				.max(DRAFT_SIZE - 1),
			...agentOperationId,
		})
		.strict(),
	z
		.object({
			action: z.literal("buy_ascension_node"),
			nodeId: z.string(),
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
			action: z.literal("buy_cooling_tower"),
			...agentOperationId,
		})
		.strict(),
	z
		.object({
			action: z.literal("vent_wall"),
			...agentOperationId,
		})
		.strict(),
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
type GameMutation = (state: MutableGameState, now: Date) => MutableGameState;

const secureRandom = (): number => {
	const values = new Uint32Array(1);
	crypto.getRandomValues(values);
	return (values[0] ?? 0) / 2 ** 32;
};

export const createDefaultGameState = (
	userId: string,
	now: Date
): MutableGameState => {
	const progress: GameProgress = {
		collection: [],
		goldenUpgrades: createInitialGoldenUpgrades(),
		producers: createInitialProducers(),
		runUpgrades: [],
		totalGoldenCans: 0,
	};
	return {
		ascensionNodes: createInitialAscensionNodes(),
		ascensionSparks: 0,
		bestRunCans: 0,
		cans: 0,

		coolant: 0,
		coolantTowers: 0,
		draftTier: 0,
		frenzyStacks: 0,
		goldenCans: 0,
		lifetimeCans: 0,
		prestigeLevel: 0,
		runCans: 0,
		runDraft: null,

		totalAscensionSparks: 0,
		userId,
		...progress,
		createdAt: now,
		frenzyEndsAt: null,
		goldenRushBuffEndsAt: null,
		goldenRushBuffKind: null,
		goldenRushReadyAt: null,
		lastAccruedAt: now,
		lastOperationId: null,
		manualClickBudget: 20,
		nextFrenzyClick: randomFrenzyThreshold(progress, secureRandom()),
		revision: 0,
		shadowBanned: false,
		unlockedAchievements: [],
		updatedAt: now,
		ventedWalls: [],
	};
};

const ensureGameState = async (
	database: Database,
	userId: string
): Promise<GameStateRow> => {
	const now = new Date();
	const [inserted] = await database
		.insert(gameState)
		.values(createDefaultGameState(userId, now))
		.onConflictDoNothing()
		.returning();
	if (inserted) {
		return inserted;
	}
	const [existing] = await database
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
	const buffEndMs = state.goldenRushBuffEndsAt?.getTime() ?? 0;
	const productionBuffMs =
		state.goldenRushBuffKind === "production_frenzy"
			? Math.max(0, Math.min(nowMs, buffEndMs) - previousMs)
			: 0;
	const offlineMultiplier =
		elapsedMs >= OFFLINE_ACCRUAL_THRESHOLD_MS
			? offlineProductionMultiplier(state)
			: 1;
	const frenzyBoost = state.frenzyStacks > 1 ? FRENZY_STACK_BONUS : 1;
	const idleGain = calculateIdleGain(
		state,
		elapsedMs,
		frenzyIdleMs,
		offlineMultiplier,
		productionBuffMs,
		PRODUCTION_FRENZY_MULTIPLIER,
		frenzyBoost
	);
	const isFrenzyActive = frenzyEndMs > nowMs;
	const isClickRushActive =
		state.goldenRushBuffKind === "click_rush" && buffEndMs > nowMs;
	const clickGain =
		acceptedClicks *
		calculateClickValue(state) *
		(isFrenzyActive ? activeFrenzyMultiplier(state, state.frenzyStacks) : 1) *
		(isClickRushActive ? CLICK_RUSH_MULTIPLIER : 1);
	let nextState = addCans(state, idleGain + clickGain);
	let { nextFrenzyClick } = state;
	let frenzyEndsAt =
		state.frenzyEndsAt && frenzyEndMs > nowMs ? state.frenzyEndsAt : null;
	let frenzyStacks = frenzyEndMs > nowMs ? state.frenzyStacks : 0;
	const canStackFrenzy = state.ascensionNodes["frenzy-stacking"] > 0;

	if (acceptedClicks >= nextFrenzyClick) {
		if (isFrenzyActive) {
			if (canStackFrenzy && frenzyStacks < MAX_FRENZY_STACKS) {
				frenzyEndsAt = new Date(frenzyEndMs + frenzyDurationMs(state));
				frenzyStacks += 1;
				nextFrenzyClick = randomFrenzyThreshold(nextState, secureRandom());
			}
		} else {
			frenzyEndsAt = new Date(nowMs + frenzyDurationMs(state));
			frenzyStacks = 1;
			nextFrenzyClick = randomFrenzyThreshold(nextState, secureRandom());
		}
	} else if (
		!isFrenzyActive ||
		(canStackFrenzy && frenzyStacks < MAX_FRENZY_STACKS)
	) {
		nextFrenzyClick -= acceptedClicks;
	}

	let { goldenRushBuffEndsAt, goldenRushBuffKind, goldenRushReadyAt } = state;
	if (goldenRushBuffEndsAt && goldenRushBuffEndsAt.getTime() <= nowMs) {
		goldenRushBuffEndsAt = null;
		goldenRushBuffKind = null;
	}
	const readyMs = goldenRushReadyAt?.getTime() ?? null;
	if (readyMs === null || nowMs > readyMs + GOLDEN_RUSH_CLAIM_WINDOW_MS) {
		goldenRushReadyAt = new Date(nowMs + rollGoldenRushDelayMs(secureRandom()));
	}

	const coolantGain =
		coolantPerSecond(state) * (elapsedMs / 1000) * offlineMultiplier;

	nextState = {
		...nextState,
		coolant: clampGameValue(state.coolant + coolantGain),
		frenzyEndsAt,
		frenzyStacks,
		goldenRushBuffEndsAt,
		goldenRushBuffKind,
		goldenRushReadyAt,
		lastAccruedAt: now,
		manualClickBudget: remainingBudget,
		nextFrenzyClick,
	};
	const { draftTier: nextTierIndex, runDraft: pendingDraft } = nextState;
	const nextTier = FLAVOR_UPGRADES[nextTierIndex];
	if (
		pendingDraft === null &&
		nextTier !== undefined &&
		nextState.cans >= nextTier.cost
	) {
		nextState = {
			...nextState,
			runDraft: rollDraftOptions(nextTierIndex, secureRandom),
		};
	}
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
	ascensionNodes: state.ascensionNodes,
	ascensionSparks: state.ascensionSparks,
	bestRunCans: state.bestRunCans,
	cans: state.cans,
	collection: state.collection,

	coolant: state.coolant,
	coolantTowers: state.coolantTowers,
	draftTier: state.draftTier,
	frenzyEndsAt: state.frenzyEndsAt?.getTime() ?? null,
	frenzyStacks: state.frenzyStacks,
	goldenCans: state.goldenCans,
	goldenRushBuffEndsAt: state.goldenRushBuffEndsAt?.getTime() ?? null,
	goldenRushBuffKind: state.goldenRushBuffKind,
	goldenRushReadyAt: state.goldenRushReadyAt?.getTime() ?? null,
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
	runDraft: state.runDraft,
	runUpgrades: state.runUpgrades,
	serverNow,
	totalAscensionSparks: state.totalAscensionSparks,
	totalGoldenCans: state.totalGoldenCans,
	unlockedAchievements: state.unlockedAchievements,
	ventedWalls: state.ventedWalls,
});

interface GameMutationResult {
	acceptedClicks: number;
	replayed: boolean;
	snapshot: GameSnapshot;
	state: MutableGameState;
}

export const mutateGameStateWithState = async (
	database: Database,
	userId: string,
	isAnonymous: boolean,
	input: MutationInput,
	mutation: GameMutation = (state) => state,
	reportIdle = false
): Promise<GameMutationResult> => {
	const serverNow = Date.now();
	const now = new Date(serverNow);
	const current = normalizePersistedGameState(
		await ensureGameState(database, userId),
		now
	);
	const disposition = getMutationDisposition(current, input);
	if (disposition === "retry") {
		return {
			acceptedClicks: 0,
			replayed: true,
			snapshot: toSnapshot(current, isAnonymous, serverNow),
			state: current,
		};
	}

	const accrual = accrueStateWithResult(
		current,
		input.pendingManualClicks,
		now
	);
	const applied = mutation(accrual.state, now);
	// Backfill derived unlocks (persisted achievements, codex flavors and
	// prestige worlds) so they land in the same revision as the triggering
	// action.
	const mutated = {
		...applied,
		collection: collectUnlockedVariants(applied),
		unlockedAchievements: unlockedAchievementIds(applied),
	};
	assertProgressionInvariants(mutated, now);
	const [saved] = await database
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
	const normalized = normalizePersistedGameState(saved, now);
	let snapshot = toSnapshot(normalized, isAnonymous, serverNow);
	const idleElapsedMs = serverNow - current.lastAccruedAt.getTime();
	if (reportIdle && idleElapsedMs >= OFFLINE_ACCRUAL_THRESHOLD_MS) {
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
			db,
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
	const current = normalizePersistedGameState(
		await ensureGameState(db, userId),
		new Date()
	);
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

export const buyProducer = (producerId: string, quantity = 1): GameMutation => {
	if (!isProducerId(producerId)) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown producer" });
	}
	return (state) => {
		const world = worldOfProducer(producerId);
		if (!(world && isWorldUnlocked(world, state.prestigeLevel))) {
			throw new TRPCError({ code: "BAD_REQUEST", message: "World is locked" });
		}
		const cost = producerBulkCost(
			producerId,
			state.producers[producerId],
			quantity
		);
		if (state.cans < cost) {
			throw insufficientFunds();
		}
		return {
			...state,
			cans: state.cans - cost,
			producers: {
				...state.producers,
				[producerId]: state.producers[producerId] + quantity,
			},
		};
	};
};

export const buyCoolingTower: GameMutation = (state) => {
	const cost = coolingTowerCost(state.coolantTowers);
	if (state.cans < cost) {
		throw insufficientFunds();
	}
	return {
		...state,
		cans: state.cans - cost,
		coolantTowers: clampGameCounter(state.coolantTowers + 1),
	};
};

export const ventWall: GameMutation = (state) => {
	const wall = activeWall(state);
	if (!wall) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "No wall to vent" });
	}
	if (state.coolant < wall.ventCost) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Not enough coolant" });
	}
	return {
		...state,
		coolant: state.coolant - wall.ventCost,
		ventedWalls: [...state.ventedWalls, wall.id],
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
			const producerId = bestStockerPurchase(nextState, nextState.cans);
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
	const goldenRushRemainingMs = Math.max(
		0,
		(nextState.goldenRushReadyAt?.getTime() ?? 0) - simulatedNow
	);
	const goldenRushBuffRemainingMs = Math.max(
		0,
		(nextState.goldenRushBuffEndsAt?.getTime() ?? 0) - simulatedNow
	);
	return {
		...nextState,
		frenzyEndsAt:
			frenzyRemainingMs > 0
				? new Date(now.getTime() + frenzyRemainingMs)
				: null,
		goldenRushBuffEndsAt:
			goldenRushBuffRemainingMs > 0
				? new Date(now.getTime() + goldenRushBuffRemainingMs)
				: null,
		goldenRushBuffKind:
			goldenRushBuffRemainingMs > 0 ? nextState.goldenRushBuffKind : null,
		goldenRushReadyAt:
			goldenRushRemainingMs > 0
				? new Date(now.getTime() + goldenRushRemainingMs)
				: now,
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
				state.prestigeLevel <
					goldenUpgradeUnlockLevel(upgrade, state.ascensionNodes) ||
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
	if (isDraftOnlyKind(upgrade.kind)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "That upgrade is only offered in flavor drafts",
		});
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

const unknownDraftOption = () =>
	new TRPCError({
		code: "BAD_REQUEST",
		message: "Unknown draft option",
	});

const applyDraftPick = (
	state: MutableGameState,
	card: RunUpgradeDefinition
): MutableGameState => {
	const nextState = {
		...state,
		draftTier: state.draftTier + 1,
		runDraft: null,
	};
	if (card.kind === "grant") {
		if (!card.producerId) {
			throw unknownDraftOption();
		}
		nextState.producers = {
			...nextState.producers,
			[card.producerId]:
				nextState.producers[card.producerId] + (card.grantQuantity ?? 1),
		};
		return nextState;
	}
	const isFlavor = card.kind === "flavor";
	if (isFlavor && nextState.cans < card.cost) {
		throw insufficientFunds();
	}
	nextState.cans = isFlavor ? nextState.cans - card.cost : nextState.cans;
	nextState.runUpgrades = [...nextState.runUpgrades, card.id];
	return nextState;
};

export const pickDraft =
	(optionIndex: number): GameMutation =>
	(state) => {
		const options = state.runDraft;
		if (!options || optionIndex < 0 || optionIndex >= options.length) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "No flavor draft available",
			});
		}
		const card = getRunUpgrade(options[optionIndex] ?? "");
		if (!(card && isDraftOnlyKind(card.kind))) {
			throw unknownDraftOption();
		}
		return applyDraftPick(state, card);
	};

export const buyAscensionNode = (nodeId: string): GameMutation => {
	if (!isAscensionNodeId(nodeId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Unknown ascension node",
		});
	}
	return (state) => {
		const node = getAscensionNode(nodeId);
		if (!node) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Unknown ascension node",
			});
		}
		const rank = state.ascensionNodes[nodeId] ?? 0;
		if (rank >= node.maxRank) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Ascension node is maxed",
			});
		}
		if (!ascensionNodeUnlocked(state.ascensionNodes, node)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Ascension node is locked",
			});
		}
		const cost = ascensionNodeCost(nodeId, rank);
		if (state.ascensionSparks < cost) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Not enough ascension sparks",
			});
		}
		return {
			...state,
			ascensionNodes: { ...state.ascensionNodes, [nodeId]: rank + 1 },
			ascensionSparks: state.ascensionSparks - cost,
		};
	};
};

export const claimGoldenRush =
	(
		randomValue: number,
		dropRandomValue = 1,
		onReward?: (reward: GoldenRushReward) => void,
		onDrop?: (variantId: string) => void
	): GameMutation =>
	(state, now) => {
		const nowMs = now.getTime();
		const readyMs = state.goldenRushReadyAt?.getTime() ?? null;
		if (
			readyMs === null ||
			nowMs < readyMs ||
			nowMs > readyMs + GOLDEN_RUSH_CLAIM_WINDOW_MS
		) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The golden can is gone",
			});
		}
		const reward = rollGoldenRushReward(state, state.cans, randomValue);
		onReward?.(reward);
		const droppedVariant = rollGoldenRushDrop(
			reward.kind,
			dropRandomValue,
			state.collection
		);
		if (droppedVariant) {
			onDrop?.(droppedVariant);
		}
		const goldenRushReadyAt = new Date(
			nowMs + rollGoldenRushDelayMs(secureRandom())
		);
		const collected =
			droppedVariant === null
				? state
				: {
						...state,
						collection: unionCollection(state.collection, [droppedVariant]),
					};
		if (reward.kind === "lucky") {
			return { ...addCans(collected, reward.cans), goldenRushReadyAt };
		}
		const buffDurationMs =
			reward.durationMs * (state.ascensionNodes["golden-echo"] > 0 ? 2 : 1);
		return {
			...collected,
			goldenRushBuffEndsAt: new Date(nowMs + buffDurationMs),
			goldenRushBuffKind: reward.kind,
			goldenRushReadyAt,
		};
	};

export const prestige: GameMutation = (state) => {
	const reward = prestigeReward(state.lifetimeCans, state.totalGoldenCans);
	if (reward < 1) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Prestige is not ready",
		});
	}
	const nextProgress: GameProgress = {
		collection: state.collection,
		goldenUpgrades: state.goldenUpgrades,
		producers: createHeadStartProducers(state.goldenUpgrades),
		runUpgrades: createStartingRunUpgrades(state.ascensionNodes),
		totalGoldenCans: clampGameCounter(state.totalGoldenCans + reward),
	};
	const sparkGain = ascensionReward(
		nextProgress.totalGoldenCans,
		state.totalAscensionSparks
	);
	let nextState: MutableGameState = {
		...state,
		...nextProgress,
		ascensionSparks: clampGameCounter(state.ascensionSparks + sparkGain),
		bestRunCans: Math.max(state.bestRunCans, state.runCans),
		cans: 0,

		coolantTowers: 0,
		draftTier: 0,
		frenzyEndsAt: null,
		frenzyStacks: 0,
		goldenCans: clampGameCounter(state.goldenCans + reward),
		nextFrenzyClick: randomFrenzyThreshold(nextProgress, secureRandom()),
		prestigeLevel: clampGameCounter(state.prestigeLevel + 1),
		runCans: 0,
		runDraft: null,

		totalAscensionSparks: clampGameCounter(
			state.totalAscensionSparks + sparkGain
		),
		ventedWalls: [],
	};
	if (state.ascensionNodes["second-wind"] > 0) {
		nextState = addCans(
			nextState,
			calculateCps(state) * ASCENSION_WIND_SECONDS
		);
	}
	return nextState;
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
	buyAscensionNode: protectedProcedure
		.input(mutationInput.extend({ nodeId: z.string() }))
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				buyAscensionNode(input.nodeId)
			)
		),
	buyCoolingTower: protectedProcedure
		.input(mutationInput)
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				buyCoolingTower
			)
		),
	buyProducer: protectedProcedure
		.input(
			mutationInput.extend({
				producerId: z.string(),
				quantity: z.number().int().min(1).max(100).optional(),
			})
		)
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				buyProducer(input.producerId, input.quantity ?? 1)
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
	claimGoldenRush: protectedProcedure
		.input(mutationInput)
		.mutation(async ({ ctx, input }) => {
			let reward: GoldenRushReward | null = null;
			let droppedVariant: string | null = null;
			const snapshot = await mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				claimGoldenRush(
					secureRandom(),
					secureRandom(),
					(rolled) => {
						reward = rolled;
					},
					(variantId) => {
						droppedVariant = variantId;
					}
				)
			);
			return { droppedVariant, reward, snapshot };
		}),
	getState: protectedProcedure.query(({ ctx }) =>
		getGameState(ctx.session.user.id, sessionIsAnonymous(ctx.session))
	),
	pickDraft: protectedProcedure
		.input(
			mutationInput.extend({
				optionIndex: z
					.number()
					.int()
					.min(0)
					.max(DRAFT_SIZE - 1),
			})
		)
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				pickDraft(input.optionIndex)
			)
		),
	prestige: protectedProcedure
		.input(mutationInput)
		.mutation(async ({ ctx, input }) => {
			const before = normalizePersistedGameState(
				await ensureGameState(db, ctx.session.user.id),
				new Date()
			);
			const requirement = nextGoldenCanRequirement(before.totalGoldenCans);
			const reward = prestigeReward(
				before.lifetimeCans,
				before.totalGoldenCans
			);
			const snapshot = await mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				prestige
			);
			trackServerEvent(
				"game.prestige.completed",
				{
					ascension_sparks_gained: Math.max(
						0,
						snapshot.ascensionSparks - before.ascensionSparks
					),
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
	ventWall: protectedProcedure
		.input(mutationInput)
		.mutation(({ ctx, input }) =>
			mutateGameState(
				ctx.session.user.id,
				sessionIsAnonymous(ctx.session),
				input,
				ventWall
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

	nodeId?: string;
	optionIndex?: number;
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
	const requirement = nextGoldenCanRequirement(state.totalGoldenCans);
	const reward = prestigeReward(state.lifetimeCans, state.totalGoldenCans);
	const producers = ALL_PRODUCERS.map((producer) => {
		const world = worldOfProducer(producer.id);
		const unlocked = world
			? isWorldUnlocked(world, state.prestigeLevel)
			: false;
		const owned = state.producers[producer.id];
		const cost = producerCost(producer.id, owned);
		return {
			affordable: unlocked && state.cans >= cost,
			baseCps: producer.baseCps,
			boosts: PRODUCER_SYNERGIES[producer.id],
			cost,
			id: producer.id,
			name: producer.name,
			owned,
			world: world?.name ?? null,
		};
	});
	const runUpgrades = RUN_UPGRADES.filter(
		(upgrade) => !isDraftOnlyKind(upgrade.kind)
	).map((upgrade) => {
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
		const unlockLevel = goldenUpgradeUnlockLevel(upgrade, state.ascensionNodes);
		const unlocked = state.prestigeLevel >= unlockLevel;
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
			unlockLevel,
		};
	});
	const draftOptions = (state.runDraft ?? []).flatMap((id) => {
		const card = getRunUpgrade(id);
		if (!(card && isDraftOnlyKind(card.kind))) {
			return [];
		}
		return [
			{
				cost: card.cost,
				description: card.description,
				id: card.id,
				kind: card.kind,
				name: card.name,
			},
		];
	});
	const draft = state.runDraft
		? { options: draftOptions, tier: state.draftTier }
		: null;

	const ascensionNodes = ASCENSION_NODES.map((node) => {
		const rank = state.ascensionNodes[node.id as AscensionNodeId] ?? 0;
		const cost = ascensionNodeCost(node.id as AscensionNodeId, rank);
		const maxed = rank >= node.maxRank;
		const unlocked = ascensionNodeUnlocked(state.ascensionNodes, node);
		return {
			affordable: !maxed && unlocked && state.ascensionSparks >= cost,
			cost,
			description: node.description,
			id: node.id,
			maxed,
			maxRank: node.maxRank,
			name: node.name,
			rank,
			unlocked,
		};
	});
	const wall = activeWall(state);
	const towerCost = coolingTowerCost(state.coolantTowers);
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
	if (draft) {
		for (const optionIndex of draft.options.keys()) {
			legalActions.push({
				action: "pick_draft",
				operationId: crypto.randomUUID(),
				optionIndex,
			});
		}
	}

	if (state.cans >= towerCost) {
		legalActions.push({
			action: "buy_cooling_tower",
			operationId: crypto.randomUUID(),
		});
	}
	if (wall && state.coolant >= wall.ventCost) {
		legalActions.push({
			action: "vent_wall",
			operationId: crypto.randomUUID(),
		});
	}
	for (const node of ascensionNodes) {
		if (node.affordable) {
			legalActions.push({
				action: "buy_ascension_node",
				nodeId: node.id,
				operationId: crypto.randomUUID(),
			});
		}
	}
	if (reward > 0) {
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
		draft,
		leaderboard: leaderboard.slice(0, 10),
		legalActions,
		result,
		shop: { ascensionNodes, goldenUpgrades, producers, runUpgrades },
		state: snapshot,
		stats: {
			ascension: {
				potential: ascensionPotential(state.totalGoldenCans),
				sparks: state.ascensionSparks,
			},
			baseClickValue: clickValue,
			cansPerSecond: calculateCps(state),
			coolant: {
				amount: state.coolant,
				coolantPerSecond: coolantPerSecond(state),
				towerCost,
				towers: state.coolantTowers,
				wall: wall
					? {
							description: wall.description,
							id: wall.id,
							name: wall.name,
							ventable: state.coolant >= wall.ventCost,
							ventCost: wall.ventCost,
						}
					: null,
			},
			effectiveClickValue:
				clickValue *
				(frenzyActive ? activeFrenzyMultiplier(state, state.frenzyStacks) : 1),
			frenzy: {
				active: frenzyActive,
				clicksUntilNext: state.nextFrenzyClick,
				multiplier: frenzyActive
					? activeFrenzyMultiplier(state, state.frenzyStacks)
					: 1,
				remainingMilliseconds: frenzyActive
					? Math.max(0, (snapshot.frenzyEndsAt ?? 0) - snapshot.serverNow)
					: 0,
				stacks: state.frenzyStacks,
			},
			manualClicksAvailable,
			prestige: {
				ready: reward > 0,
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
	if (command.action === "pick_draft") {
		return pickDraft(command.optionIndex);
	}
	if (command.action === "buy_cooling_tower") {
		return buyCoolingTower;
	}
	if (command.action === "vent_wall") {
		return ventWall;
	}
	if (command.action === "buy_ascension_node") {
		return buyAscensionNode(command.nodeId);
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
	if (command.action === "pick_draft") {
		return { ...base, optionIndex: command.optionIndex };
	}
	if (command.action === "buy_ascension_node") {
		return { ...base, nodeId: command.nodeId };
	}
	return base;
};

export const runAgentGameCommand = async (
	userId: string,
	isAnonymous: boolean,
	command: AgentGameCommand
) => {
	const current = normalizePersistedGameState(
		await ensureGameState(db, userId),
		new Date()
	);
	const mutationResult = await mutateGameStateWithState(
		db,
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
