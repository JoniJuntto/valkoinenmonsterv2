import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { FRENZY_DURATION_MS } from "../game";

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3001";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";

const {
	accrueState,
	advanceOpenState,
	agentGameCommandSchema,
	buyProducer,
	buyUpgrade,
	createAgentGameObservation,
	createDefaultGameState,
	getMutationDisposition,
	leaderboardForViewer,
	prestige,
	rankLeaderboard,
	resetGameState,
} = await import("./game");

const operationId = "00000000-0000-4000-8000-000000000001";

describe("server-authoritative mutations", () => {
	test("recognizes idempotent retries and rejects stale revisions", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.lastOperationId = operationId;
		state.revision = 4;
		expect(getMutationDisposition(state, { operationId, revision: 3 })).toBe(
			"retry"
		);
		expect(() =>
			getMutationDisposition(state, {
				operationId: "00000000-0000-4000-8000-000000000002",
				revision: 3,
			})
		).toThrow(TRPCError);
	});

	test("validates producer IDs and funds", () => {
		const state = createDefaultGameState("user", new Date(0));
		expect(() => buyProducer("unknown")).toThrow("Unknown producer");
		expect(() => buyProducer("pull-tab")(state, new Date(0))).toThrow(
			"Not enough cans"
		);
		state.cans = 15;
		const purchased = buyProducer("pull-tab")(state, new Date(0));
		expect(purchased.cans).toBe(0);
		expect(purchased.producers["pull-tab"]).toBe(1);
	});

	test("enforces milestone and golden upgrade gates", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.cans = 10_000;
		expect(() => buyUpgrade("pull-tab-25")(state, new Date(0))).toThrow(
			"Upgrade is locked"
		);
		expect(() => buyUpgrade("auto-tapper")(state, new Date(0))).toThrow(
			"Golden upgrade is locked"
		);
		state.producers["pull-tab"] = 25;
		const upgraded = buyUpgrade("pull-tab-25")(state, new Date(0));
		expect(upgraded.runUpgrades).toContain("pull-tab-25");
	});

	test("resets run progress while preserving permanent progress", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.cans = 120_000;
		state.runCans = 400_000;
		state.lifetimeCans = 500_000;
		state.producers["mini-fridge"] = 4;
		state.runUpgrades.push("cold-can");
		state.goldenUpgrades["golden-grip"] = 2;
		const reset = prestige(state, new Date(0));
		expect(reset.cans).toBe(0);
		expect(reset.runCans).toBe(0);
		expect(reset.producers["mini-fridge"]).toBe(0);
		expect(reset.runUpgrades).toEqual([]);
		expect(reset.lifetimeCans).toBe(500_000);
		expect(reset.goldenUpgrades["golden-grip"]).toBe(2);
		expect(reset.goldenCans).toBe(2);
		expect(reset.prestigeLevel).toBe(1);
	});

	test("increases the prestige requirement after each reset", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.prestigeLevel = 1;
		state.totalGoldenCans = 2;
		state.runCans = 100_000;
		expect(() => prestige(state, new Date(0))).toThrow("Prestige is not ready");

		state.runCans = 200_000;
		const reset = prestige(state, new Date(0));
		expect(reset.goldenCans).toBe(1);
		expect(reset.prestigeLevel).toBe(2);
		expect(reset.totalGoldenCans).toBe(3);
	});
});

describe("server accrual and leaderboard", () => {
	test("accrues long offline intervals at 10% without a time cap", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.producers["mini-fridge"] = 1;
		const weekMs = 7 * 24 * 60 * 60 * 1000;
		const accrued = accrueState(state, 0, new Date(weekMs));
		expect(accrued.cans).toBe(weekMs / 10_000);

		const boostedState = createDefaultGameState("boosted-user", new Date(0));
		boostedState.producers["mini-fridge"] = 1;
		boostedState.goldenUpgrades["time-capsule"] = 1;
		const boosted = accrueState(boostedState, 0, new Date(weekMs));
		expect(boosted.cans).toBe(weekMs / 5000);
	});

	test("uses exactly the remaining frenzy duration", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.producers["mini-fridge"] = 1;
		state.frenzyEndsAt = new Date(FRENZY_DURATION_MS);
		const accrued = accrueState(state, 1, new Date(FRENZY_DURATION_MS));
		expect(accrued.cans).toBe(81);
		expect(accrued.frenzyEndsAt).toBeNull();
	});

	test("orders ties by creation time and limits results", () => {
		const rows = Array.from({ length: 51 }, (_, index) => ({
			createdAt: new Date(index * 1000),
			lifetimeCans: index < 2 ? 100 : 50,
			name: `Player ${index}`,
			prestigeLevel: 0,
			userId: `user-${index}`,
		}));
		const ranked = rankLeaderboard(rows);
		expect(ranked).toHaveLength(50);
		expect(ranked[0]?.userId).toBe("user-0");
		expect(ranked[1]?.userId).toBe("user-1");
	});

	test("shows a shadow-banned viewer an apparent self entry", () => {
		const publicRows = [
			{
				createdAt: new Date(0),
				lifetimeCans: 10,
				name: "Public",
				prestigeLevel: 0,
				userId: "public",
			},
		];
		const viewer = {
			createdAt: new Date(1),
			lifetimeCans: 20,
			name: "Hidden",
			prestigeLevel: 0,
			shadowBanned: true,
			userId: "hidden",
		};
		expect(
			leaderboardForViewer(publicRows).map(({ userId }) => userId)
		).toEqual(["public"]);
		expect(
			leaderboardForViewer(publicRows, viewer).map(({ userId }) => userId)
		).toEqual(["hidden", "public"]);
	});
});

describe("JSON agent game mode", () => {
	test("strictly validates every command shape and bound", () => {
		const validCommands = [
			{ action: "observe" },
			{ action: "click", count: 20, operationId },
			{ action: "buy_producer", operationId, producerId: "pull-tab" },
			{ action: "buy_upgrade", operationId, upgradeId: "cold-can" },
			{ action: "wait", milliseconds: 5000, operationId },
			{ action: "prestige", operationId },
			{ action: "reset", confirm: "RESET", operationId },
		];
		for (const command of validCommands) {
			expect(agentGameCommandSchema.safeParse(command).success).toBe(true);
		}

		const invalidCommands = [
			{ action: "observe", extra: true },
			{ action: "click", count: 0, operationId },
			{ action: "click", count: 10_001, operationId },
			{ action: "wait", milliseconds: 3_600_001, operationId },
			{ action: "reset", confirm: "yes", operationId },
			{ action: "prestige", operationId: "not-a-uuid" },
		];
		for (const command of invalidCommands) {
			expect(agentGameCommandSchema.safeParse(command).success).toBe(false);
		}
	});

	test("advances online production and Smart Stocker on five-second ticks", () => {
		const now = new Date(0);
		const online = createDefaultGameState("online", now);
		online.producers["mini-fridge"] = 1;
		const advanced = advanceOpenState(online, 20_000, now);
		expect(advanced.cans).toBe(20);
		expect(advanced.lastAccruedAt).toEqual(now);

		const stocked = createDefaultGameState("stocked", now);
		stocked.cans = 1000;
		stocked.goldenUpgrades["smart-stocker"] = 1;
		const autoPurchased = advanceOpenState(stocked, 10_000, now);
		expect(autoPurchased.producers["pull-tab"]).toBe(2);
		expect(autoPurchased.cans).toBe(968.5);
	});

	test("rebases active frenzy time and resets only gameplay progress", () => {
		const now = new Date(0);
		const state = createDefaultGameState("user", now);
		state.frenzyEndsAt = new Date(FRENZY_DURATION_MS);
		state.producers["mini-fridge"] = 1;
		const advanced = advanceOpenState(state, 3000, now);
		expect(advanced.cans).toBe(30);
		expect(advanced.frenzyEndsAt?.getTime()).toBe(5000);

		advanced.cans = 123;
		advanced.lifetimeCans = 456;
		advanced.shadowBanned = true;
		const reset = resetGameState(advanced, new Date(10_000));
		expect(reset.cans).toBe(0);
		expect(reset.lifetimeCans).toBe(0);
		expect(reset.producers["mini-fridge"]).toBe(0);
		expect(reset.userId).toBe("user");
		expect(reset.createdAt).toEqual(now);
		expect(reset.shadowBanned).toBe(true);
	});

	test("returns derived shop state and directly reusable legal actions", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.cans = 100;
		const snapshot = {
			bestRunCans: state.bestRunCans,
			cans: state.cans,
			frenzyEndsAt: null,
			goldenCans: state.goldenCans,
			goldenUpgrades: state.goldenUpgrades,
			idleReport: null,
			isAnonymous: false,
			isShadowBanned: false,
			lastAccruedAt: 0,
			lifetimeCans: state.lifetimeCans,
			nextFrenzyClick: state.nextFrenzyClick,
			prestigeLevel: state.prestigeLevel,
			producers: state.producers,
			revision: state.revision,
			runCans: state.runCans,
			runUpgrades: state.runUpgrades,
			serverNow: 0,
			totalGoldenCans: state.totalGoldenCans,
		};
		const observation = createAgentGameObservation(state, snapshot, [], {
			action: "observe",
			replayed: false,
		});
		expect(observation.stats.manualClicksAvailable).toBe(20);
		expect(
			observation.shop.producers.find(({ id }) => id === "mini-fridge")
				?.affordable
		).toBe(true);
		expect(
			observation.legalActions.some(
				(action) =>
					action.action === "buy_producer" &&
					action.producerId === "mini-fridge"
			)
		).toBe(true);
		for (const action of observation.legalActions) {
			expect(agentGameCommandSchema.safeParse(action).success).toBe(true);
		}
	});
});
