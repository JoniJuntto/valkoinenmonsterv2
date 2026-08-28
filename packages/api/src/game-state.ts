import type { GameStateRow } from "@valkoinenmonsterv2/db/schema/game";

import {
	CLICK_RUSH_DURATION_MS,
	clampGameCounter,
	clampGameValue,
	createInitialGoldenUpgrades,
	createInitialProducers,
	FRENZY_CHRONOMETER_BONUS_MS,
	FRENZY_DURATION_MS,
	type GameProgress,
	GOLDEN_RUSH_MAX_DELAY_MS,
	GOLDEN_UPGRADES,
	type GoldenRushBuffKind,
	type GoldenUpgradeRanks,
	isGoldenRushBuffKind,
	isRunUpgradeId,
	MAX_GAME_VALUE,
	MAX_MANUAL_CLICK_BUDGET,
	MAX_PERSISTED_COUNTER,
	PRODUCERS,
	PRODUCTION_FRENZY_DURATION_MS,
	type ProducerCounts,
} from "./game";

export type MutableGameState = Omit<
	GameStateRow,
	"producers" | "goldenUpgrades" | "goldenRushBuffKind"
> &
	GameProgress & { goldenRushBuffKind: GoldenRushBuffKind | null };

const finiteInteger = (
	value: number,
	maximum = Number.MAX_SAFE_INTEGER
): number =>
	Math.min(
		maximum,
		Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
	);

const validDate = (value: Date | null): value is Date =>
	value !== null && Number.isFinite(value.getTime());

const normalizeProducers = (value: unknown): ProducerCounts => {
	const producers = createInitialProducers();
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return producers;
	}
	const stored = value as Record<string, unknown>;
	for (const producer of PRODUCERS) {
		const owned = stored[producer.id];
		producers[producer.id] = finiteInteger(
			typeof owned === "number" ? owned : 0
		);
	}
	return producers;
};

const normalizeGoldenUpgrades = (value: unknown): GoldenUpgradeRanks => {
	const upgrades = createInitialGoldenUpgrades();
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return upgrades;
	}
	const stored = value as Record<string, unknown>;
	for (const upgrade of GOLDEN_UPGRADES) {
		const rank = stored[upgrade.id];
		upgrades[upgrade.id] = finiteInteger(
			typeof rank === "number" ? rank : 0,
			upgrade.maxRank
		);
	}
	return upgrades;
};

const normalizeTimer = (
	value: Date | null,
	serverNowMs: number,
	maximumFutureMs: number
): Date | null => {
	if (!validDate(value)) {
		return null;
	}
	return value.getTime() > serverNowMs + maximumFutureMs
		? new Date(serverNowMs + maximumFutureMs)
		: value;
};

export const normalizePersistedGameState = (
	state: GameStateRow,
	serverNow: Date
): MutableGameState => {
	const serverNowMs = serverNow.getTime();
	const cans = clampGameValue(state.cans);
	const runCans = Math.max(cans, clampGameValue(state.runCans));
	const bestRunCans = Math.max(runCans, clampGameValue(state.bestRunCans));
	const lifetimeCans = Math.max(
		bestRunCans,
		clampGameValue(state.lifetimeCans)
	);
	const goldenCans = clampGameCounter(state.goldenCans);
	const totalGoldenCans = Math.max(
		goldenCans,
		clampGameCounter(state.totalGoldenCans)
	);
	const goldenUpgrades = normalizeGoldenUpgrades(state.goldenUpgrades);
	const goldenRushBuffKind =
		state.goldenRushBuffKind && isGoldenRushBuffKind(state.goldenRushBuffKind)
			? state.goldenRushBuffKind
			: null;
	const buffDurationMs =
		goldenRushBuffKind === "click_rush"
			? CLICK_RUSH_DURATION_MS
			: PRODUCTION_FRENZY_DURATION_MS;
	const goldenRushBuffEndsAt = goldenRushBuffKind
		? normalizeTimer(state.goldenRushBuffEndsAt, serverNowMs, buffDurationMs)
		: null;

	return {
		...state,
		bestRunCans,
		cans,
		frenzyEndsAt: normalizeTimer(
			state.frenzyEndsAt,
			serverNowMs,
			FRENZY_DURATION_MS +
				goldenUpgrades["frenzy-chronometer"] * FRENZY_CHRONOMETER_BONUS_MS
		),
		goldenCans,
		goldenRushBuffEndsAt,
		goldenRushBuffKind: goldenRushBuffEndsAt ? goldenRushBuffKind : null,
		goldenRushReadyAt: normalizeTimer(
			state.goldenRushReadyAt,
			serverNowMs,
			GOLDEN_RUSH_MAX_DELAY_MS
		),
		goldenUpgrades,
		lastAccruedAt:
			validDate(state.lastAccruedAt) &&
			state.lastAccruedAt.getTime() <= serverNowMs
				? state.lastAccruedAt
				: serverNow,
		lifetimeCans,
		manualClickBudget: Math.min(
			MAX_MANUAL_CLICK_BUDGET,
			Math.max(
				0,
				Number.isFinite(state.manualClickBudget) ? state.manualClickBudget : 0
			)
		),
		nextFrenzyClick: Math.max(1, finiteInteger(state.nextFrenzyClick)),
		prestigeLevel: clampGameCounter(state.prestigeLevel),
		producers: normalizeProducers(state.producers),
		revision: clampGameCounter(state.revision),
		runCans,
		runUpgrades: Array.isArray(state.runUpgrades)
			? [...new Set(state.runUpgrades.filter(isRunUpgradeId))]
			: [],
		totalGoldenCans,
	};
};

const invariant = (condition: boolean, message: string): void => {
	if (!condition) {
		throw new Error(`Progression invariant failed: ${message}`);
	}
};

export const assertProgressionInvariants = (
	state: MutableGameState,
	serverNow: Date
): void => {
	const values = [
		state.cans,
		state.runCans,
		state.bestRunCans,
		state.lifetimeCans,
	];
	invariant(
		values.every((value) => Number.isFinite(value) && value >= 0),
		"can balances must be finite and non-negative"
	);
	invariant(
		state.cans <= state.runCans &&
			state.runCans <= state.bestRunCans &&
			state.bestRunCans <= state.lifetimeCans &&
			state.lifetimeCans <= MAX_GAME_VALUE,
		"can balances must follow cumulative ordering"
	);
	invariant(
		Number.isInteger(state.goldenCans) &&
			state.goldenCans >= 0 &&
			Number.isInteger(state.totalGoldenCans) &&
			state.totalGoldenCans <= MAX_PERSISTED_COUNTER &&
			state.goldenCans <= state.totalGoldenCans,
		"golden can balances must be valid"
	);
	for (const value of [state.prestigeLevel, state.revision]) {
		invariant(
			Number.isInteger(value) && value >= 0 && value <= MAX_PERSISTED_COUNTER,
			"counters must be valid"
		);
	}
	invariant(
		Object.keys(state.producers).length === PRODUCERS.length &&
			PRODUCERS.every(({ id }) => {
				const owned = state.producers[id];
				return Number.isInteger(owned) && owned >= 0 && owned <= MAX_GAME_VALUE;
			}),
		"producer counts must match the catalog"
	);
	invariant(
		state.runUpgrades.length === new Set(state.runUpgrades).size &&
			state.runUpgrades.every(isRunUpgradeId),
		"run upgrades must be known and unique"
	);
	invariant(
		Object.keys(state.goldenUpgrades).length === GOLDEN_UPGRADES.length &&
			GOLDEN_UPGRADES.every(({ id, maxRank }) => {
				const rank = state.goldenUpgrades[id];
				return Number.isInteger(rank) && rank >= 0 && rank <= maxRank;
			}),
		"golden upgrade ranks must match the catalog"
	);
	invariant(
		Number.isFinite(state.manualClickBudget) &&
			state.manualClickBudget >= 0 &&
			state.manualClickBudget <= MAX_MANUAL_CLICK_BUDGET,
		"manual click budget must be bounded"
	);
	invariant(
		Number.isInteger(state.nextFrenzyClick) && state.nextFrenzyClick >= 1,
		"next frenzy click must be a positive integer"
	);
	invariant(
		validDate(state.lastAccruedAt) &&
			state.lastAccruedAt.getTime() <= serverNow.getTime(),
		"last accrual time cannot be in the future"
	);
	invariant(
		(state.goldenRushBuffKind === null) ===
			(state.goldenRushBuffEndsAt === null),
		"golden rush buff kind and end must form a pair"
	);
	const serverNowMs = serverNow.getTime();
	const maximumFrenzyEnd =
		serverNowMs +
		FRENZY_DURATION_MS +
		state.goldenUpgrades["frenzy-chronometer"] * FRENZY_CHRONOMETER_BONUS_MS;
	invariant(
		state.frenzyEndsAt === null ||
			(validDate(state.frenzyEndsAt) &&
				state.frenzyEndsAt.getTime() <= maximumFrenzyEnd),
		"frenzy timer must use the canonical horizon"
	);
	invariant(
		state.goldenRushReadyAt === null ||
			(validDate(state.goldenRushReadyAt) &&
				state.goldenRushReadyAt.getTime() <=
					serverNowMs + GOLDEN_RUSH_MAX_DELAY_MS),
		"golden rush readiness must use the canonical horizon"
	);
	const maximumBuffDuration =
		state.goldenRushBuffKind === "click_rush"
			? CLICK_RUSH_DURATION_MS
			: PRODUCTION_FRENZY_DURATION_MS;
	invariant(
		state.goldenRushBuffEndsAt === null ||
			(validDate(state.goldenRushBuffEndsAt) &&
				state.goldenRushBuffEndsAt.getTime() <=
					serverNowMs + maximumBuffDuration),
		"golden rush buff must use the canonical horizon"
	);
};
