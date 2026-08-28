import { describe, expect, test } from "bun:test";
import type { GameStateRow } from "@valkoinenmonsterv2/db/schema/game";

import {
	CLICK_RUSH_DURATION_MS,
	createInitialAscensionNodes,
	createInitialGoldenUpgrades,
	createInitialProducers,
	FRENZY_DURATION_MS,
	GOLDEN_RUSH_MAX_DELAY_MS,
	MAX_MANUAL_CLICK_BUDGET,
} from "./game";
import {
	assertProgressionInvariants,
	normalizePersistedGameState,
} from "./game-state";

const createRow = (): GameStateRow => ({
	ascensionNodes: createInitialAscensionNodes(),
	ascensionSparks: 0,
	bestRunCans: 0,
	cans: 0,
	collection: [],
	coolant: 0,
	coolantTowers: 0,
	createdAt: new Date(0),
	frenzyEndsAt: null,
	frenzyStacks: 0,
	goldenCans: 0,
	goldenRushBuffEndsAt: null,
	goldenRushBuffKind: null,
	goldenRushReadyAt: null,
	goldenUpgrades: createInitialGoldenUpgrades(),
	lastAccruedAt: new Date(0),
	lastOperationId: null,
	lifetimeCans: 0,
	manualClickBudget: 20,
	nextFrenzyClick: 1,
	prestigeLevel: 0,
	producers: createInitialProducers(),
	revision: 0,
	runCans: 0,
	runUpgrades: [],
	shadowBanned: false,
	totalAscensionSparks: 0,
	totalGoldenCans: 0,
	unlockedAchievements: [],
	updatedAt: new Date(0),
	userId: "user",
	ventedWalls: [],
});

describe("persisted game state", () => {
	test("repairs malformed balances, counters, and collections", () => {
		const row = createRow();
		row.lifetimeCans = 1000.5;
		row.bestRunCans = 2000;
		row.runCans = 1500;
		row.cans = 1200;
		row.goldenCans = 99;
		row.totalGoldenCans = 3.9;
		row.prestigeLevel = 2.9;
		row.revision = -1;
		row.manualClickBudget = MAX_MANUAL_CLICK_BUDGET + 1;
		row.nextFrenzyClick = 0;
		row.producers = { "pull-tab": 2.9, unknown: 10 };
		row.runUpgrades = ["cold-can", "unknown", "cold-can"];
		row.goldenUpgrades = { "golden-grip": 100, unknown: 2 };
		row.ascensionNodes = { "second-nature": 9, unknown: 2 };
		row.ascensionSparks = 12.9;
		row.totalAscensionSparks = 7;

		const normalized = normalizePersistedGameState(row, new Date(1000));

		expect(normalized.cans).toBe(1200);
		expect(normalized.runCans).toBe(1500);
		expect(normalized.bestRunCans).toBe(2000);
		expect(normalized.lifetimeCans).toBe(2000);
		expect(normalized.goldenCans).toBe(99);
		expect(normalized.totalGoldenCans).toBe(99);
		expect(normalized.prestigeLevel).toBe(2);
		expect(normalized.revision).toBe(0);
		expect(normalized.manualClickBudget).toBe(MAX_MANUAL_CLICK_BUDGET);
		expect(normalized.nextFrenzyClick).toBe(1);
		expect(normalized.producers["pull-tab"]).toBe(2);
		expect(Object.keys(normalized.producers)).not.toContain("unknown");
		expect(normalized.runUpgrades).toEqual(["cold-can"]);
		expect(normalized.goldenUpgrades["golden-grip"]).toBe(25);
		expect(Object.keys(normalized.goldenUpgrades)).not.toContain("unknown");
		expect(normalized.ascensionNodes["second-nature"]).toBe(3);
		expect(Object.keys(normalized.ascensionNodes)).not.toContain("unknown");
		expect(normalized.ascensionSparks).toBe(7);
		expect(normalized.totalAscensionSparks).toBe(7);
		expect(() =>
			assertProgressionInvariants(normalized, new Date(1000))
		).not.toThrow();
	});

	test("repairs coolant balances and vented wall prefixes", () => {
		const row = createRow();
		row.coolant = Number.NaN;
		row.coolantTowers = 2.9;
		row.ventedWalls = ["blackout", "overheat", "unknown"];

		const normalized = normalizePersistedGameState(row, new Date(0));

		expect(normalized.coolant).toBe(0);
		expect(normalized.coolantTowers).toBe(2);
		// "blackout" is dropped, leaving the longest valid vented prefix.
		expect(normalized.ventedWalls).toEqual(["overheat"]);
		expect(() =>
			assertProgressionInvariants(normalized, new Date(0))
		).not.toThrow();

		row.coolant = 42;
		row.ventedWalls = ["overheat"];
		const clean = normalizePersistedGameState(row, new Date(0));
		expect(clean.coolant).toBe(42);
		expect(clean.ventedWalls).toEqual(["overheat"]);
	});

	test("repairs future and malformed timers to canonical horizons", () => {
		const row = createRow();
		const now = new Date(10_000);
		row.lastAccruedAt = new Date(20_000);
		row.frenzyEndsAt = new Date(1_000_000);
		row.goldenRushReadyAt = new Date(1_000_000);
		row.goldenRushBuffKind = "click_rush";
		row.goldenRushBuffEndsAt = new Date(1_000_000);

		const normalized = normalizePersistedGameState(row, now);

		expect(normalized.lastAccruedAt).toEqual(now);
		expect(normalized.frenzyEndsAt?.getTime()).toBe(
			now.getTime() + FRENZY_DURATION_MS
		);
		expect(normalized.goldenRushReadyAt?.getTime()).toBe(
			now.getTime() + GOLDEN_RUSH_MAX_DELAY_MS
		);
		expect(normalized.goldenRushBuffEndsAt?.getTime()).toBe(
			now.getTime() + CLICK_RUSH_DURATION_MS
		);

		row.goldenRushBuffKind = "invalid";
		row.goldenRushBuffEndsAt = new Date(Number.NaN);
		const malformed = normalizePersistedGameState(row, now);
		expect(malformed.goldenRushBuffKind).toBeNull();
		expect(malformed.goldenRushBuffEndsAt).toBeNull();
	});

	test("rejects transition states that break progression ordering", () => {
		const state = normalizePersistedGameState(createRow(), new Date(0));
		state.cans = 1;

		expect(() => assertProgressionInvariants(state, new Date(0))).toThrow(
			"can balances must follow cumulative ordering"
		);
	});
});
