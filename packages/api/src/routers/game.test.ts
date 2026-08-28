import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import {
	FLAVOR_UPGRADES,
	FRENZY_DURATION_MS,
	frenzyDurationMs,
	GOLDEN_RUSH_CLAIM_WINDOW_MS,
	producerBulkCost,
} from "../game";

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
	claimGoldenRush,
	createAgentGameObservation,
	createDefaultGameState,
	getMutationDisposition,
	leaderboardForViewer,
	pickDraft,
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

	test("sells no flavor or draft cards outside drafts", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.cans = Number.MAX_SAFE_INTEGER;
		expect(() => buyUpgrade("ultra-white")(state, new Date(0))).toThrow(
			"only offered in flavor drafts"
		);
		expect(() =>
			buyUpgrade("draft-spare-pull-tabs")(state, new Date(0))
		).toThrow("only offered in flavor drafts");
		expect(() => buyUpgrade("draft-frenzy-chug")(state, new Date(0))).toThrow(
			"only offered in flavor drafts"
		);
	});

	test("buys producers in bulk for the summed sequential cost", () => {
		const state = createDefaultGameState("user", new Date(0));
		const cost = producerBulkCost("pull-tab", 0, 10);
		state.cans = cost - 1;
		expect(() => buyProducer("pull-tab", 10)(state, new Date(0))).toThrow(
			"Not enough cans"
		);
		state.cans = cost;
		const purchased = buyProducer("pull-tab", 10)(state, new Date(0));
		expect(purchased.cans).toBe(0);
		expect(purchased.producers["pull-tab"]).toBe(10);
	});

	test("claims golden rushes only inside the spawn window", () => {
		const state = createDefaultGameState("user", new Date(0));
		expect(() => claimGoldenRush(0.5)(state, new Date(0))).toThrow(
			"The golden can is gone"
		);
		state.goldenRushReadyAt = new Date(1000);
		expect(() => claimGoldenRush(0.5)(state, new Date(999))).toThrow(
			"The golden can is gone"
		);
		expect(() =>
			claimGoldenRush(0.5)(state, new Date(1001 + GOLDEN_RUSH_CLAIM_WINDOW_MS))
		).toThrow("The golden can is gone");
		expect(() =>
			claimGoldenRush(0.5)(state, new Date(1000 + GOLDEN_RUSH_CLAIM_WINDOW_MS))
		).not.toThrow();

		const buffed = claimGoldenRush(0.5)(state, new Date(1000));
		expect(buffed.goldenRushBuffKind).toBe("click_rush");
		expect(buffed.goldenRushBuffEndsAt?.getTime()).toBe(16_000);
		expect(buffed.goldenRushReadyAt?.getTime()).toBeGreaterThan(1000);

		state.cans = 1_000_000;
		state.producers["mini-fridge"] = 9;
		const lucky = claimGoldenRush(0.1)(state, new Date(1000));
		expect(lucky.cans).toBe(1_008_100);
		expect(lucky.goldenRushBuffKind).toBeNull();
	});

	test("rolls a draft when the next flavor tier becomes affordable", () => {
		const state = createDefaultGameState("user", new Date(0));
		const tierCost = 1_000_000;
		state.cans = tierCost - 1;
		expect(accrueState(state, 0, new Date(1000)).runDraft).toBeNull();
		state.cans = tierCost;
		const rolled = accrueState(state, 0, new Date(1000));
		expect(rolled.runDraft).toHaveLength(3);
		expect(rolled.runDraft?.[0]).toBe(FLAVOR_UPGRADES[0]?.id);
		expect(new Set(rolled.runDraft).size).toBe(3);
		// The pending draft survives later accruals without re-rolling.
		const settled = accrueState(rolled, 0, new Date(2000));
		expect(settled.runDraft).toEqual(rolled.runDraft);
	});

	test("picking the flavor card charges the tier price", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.draftTier = 0;
		state.runDraft = [
			"ultra-white",
			"draft-spare-pull-tabs",
			"draft-fridge-restock",
		];
		state.cans = 1_000_000;
		const picked = pickDraft(0)(state, new Date(0));
		expect(picked.cans).toBe(0);
		expect(picked.runUpgrades).toContain("ultra-white");
		expect(picked.draftTier).toBe(1);
		expect(picked.runDraft).toBeNull();
		expect(picked.producers["pull-tab"]).toBe(0);
	});

	test("picking a free grant card banks the cans instead", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.draftTier = 0;
		state.runDraft = [
			"ultra-white",
			"draft-spare-pull-tabs",
			"draft-fridge-restock",
		];
		state.cans = 1_000_000;
		const picked = pickDraft(1)(state, new Date(0));
		expect(picked.cans).toBe(1_000_000);
		expect(picked.producers["pull-tab"]).toBe(5);
		expect(picked.runUpgrades).not.toContain("draft-spare-pull-tabs");
		expect(picked.draftTier).toBe(1);
		expect(picked.runDraft).toBeNull();
	});

	test("picking frenzy chug extends every later frenzy", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.draftTier = 0;
		state.runDraft = [
			"ultra-white",
			"draft-frenzy-chug",
			"draft-spare-pull-tabs",
		];
		const picked = pickDraft(1)(state, new Date(0));
		expect(picked.runUpgrades).toContain("draft-frenzy-chug");
		expect(frenzyDurationMs(picked)).toBe(FRENZY_DURATION_MS + 10_000);
		picked.producers["mini-fridge"] = 1;
		picked.frenzyEndsAt = new Date(FRENZY_DURATION_MS + 10_000);
		const accrued = accrueState(
			picked,
			1,
			new Date(FRENZY_DURATION_MS + 10_000)
		);
		// 18s at 1 CPS with ×10 frenzy = 180s of production time; the 18s elapsed
		// crosses the 15s offline threshold (×10% rate): 18 + 1 click = 19.
		expect(accrued.cans).toBe(19);
	});

	test("rejects draft picks without a draft or a bad index", () => {
		const state = createDefaultGameState("user", new Date(0));
		expect(() => pickDraft(0)(state, new Date(0))).toThrow(
			"No flavor draft available"
		);
		state.runDraft = [
			"ultra-white",
			"draft-spare-pull-tabs",
			"draft-fridge-restock",
		];
		expect(() => pickDraft(3)(state, new Date(0))).toThrow(
			"No flavor draft available"
		);
		expect(() => pickDraft(-1)(state, new Date(0))).toThrow(
			"No flavor draft available"
		);
	});

	test("gives head-start producers on prestige", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.lifetimeCans = 4_000_000;
		state.goldenUpgrades["head-start"] = 1;
		const reset = prestige(state, new Date(0));
		expect(reset.producers["pull-tab"]).toBe(10);
		expect(reset.producers["monster-singularity"]).toBe(10);
		expect(reset.producers["taurine-comet"]).toBe(0);
	});

	test("resets and preserves every prestige field by contract", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.cans = 120_000;
		state.runCans = 400_000;
		state.bestRunCans = 300_000;
		state.lifetimeCans = 25_000_000;
		state.producers["mini-fridge"] = 4;
		state.runUpgrades.push("cold-can");
		state.goldenUpgrades["golden-grip"] = 2;
		state.goldenUpgrades["head-start"] = 2;
		state.goldenCans = 1;
		state.totalGoldenCans = 3;
		state.prestigeLevel = 6;
		state.manualClickBudget = 37.5;
		state.lastAccruedAt = new Date(1234);
		state.frenzyEndsAt = new Date(2000);
		state.goldenRushReadyAt = new Date(3000);
		state.goldenRushBuffKind = "production_frenzy";
		state.goldenRushBuffEndsAt = new Date(4000);
		state.draftTier = 3;
		state.runDraft = [
			"ultra-gold",
			"draft-spare-pull-tabs",
			"draft-frenzy-chug",
		];
		state.shadowBanned = true;
		const reset = prestige(state, new Date(0));
		expect(reset.cans).toBe(0);
		expect(reset.runCans).toBe(0);
		expect(reset.bestRunCans).toBe(400_000);
		expect(reset.producers["pull-tab"]).toBe(25);
		expect(reset.producers["monster-singularity"]).toBe(25);
		expect(reset.producers["taurine-comet"]).toBe(0);
		expect(reset.runUpgrades).toEqual([]);
		expect(reset.lifetimeCans).toBe(25_000_000);
		expect(reset.goldenUpgrades["golden-grip"]).toBe(2);
		expect(reset.goldenCans).toBe(3);
		expect(reset.totalGoldenCans).toBe(5);
		expect(reset.prestigeLevel).toBe(7);
		expect(reset.frenzyEndsAt).toBeNull();
		expect(reset.nextFrenzyClick).toBeGreaterThanOrEqual(1);
		expect(reset.manualClickBudget).toBe(37.5);
		expect(reset.lastAccruedAt).toEqual(new Date(1234));
		expect(reset.goldenRushReadyAt).toEqual(new Date(3000));
		expect(reset.goldenRushBuffKind).toBe("production_frenzy");
		expect(reset.goldenRushBuffEndsAt).toEqual(new Date(4000));
		expect(reset.draftTier).toBe(0);
		expect(reset.runDraft).toBeNull();
		expect(reset.userId).toBe("user");
		expect(reset.createdAt).toEqual(new Date(0));
		expect(reset.shadowBanned).toBe(true);
	});

	test("only awards golden cans past the next square-root threshold", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.prestigeLevel = 1;
		state.totalGoldenCans = 2;
		state.lifetimeCans = 8_999_999;
		expect(() => prestige(state, new Date(0))).toThrow("Prestige is not ready");

		state.lifetimeCans = 9_000_000;
		const reset = prestige(state, new Date(0));
		expect(reset.goldenCans).toBe(1);
		expect(reset.prestigeLevel).toBe(2);
		expect(reset.totalGoldenCans).toBe(3);
	});
});

describe("server accrual and leaderboard", () => {
	test("switches to offline production at exactly 15 seconds", () => {
		const online = createDefaultGameState("online", new Date(0));
		online.producers["mini-fridge"] = 1;
		expect(accrueState(online, 0, new Date(14_999)).cans).toBeCloseTo(14.999);

		const offline = createDefaultGameState("offline", new Date(0));
		offline.producers["mini-fridge"] = 1;
		expect(accrueState(offline, 0, new Date(15_000)).cans).toBeCloseTo(1.5);
	});

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

	test("applies production buffs for their overlap and then clears them", () => {
		const state = createDefaultGameState("user", new Date(0));
		state.producers["mini-fridge"] = 1;
		state.goldenRushBuffKind = "production_frenzy";
		state.goldenRushBuffEndsAt = new Date(5000);
		const accrued = accrueState(state, 0, new Date(10_000));
		// 10s at 1 CPS with 5s of ×7 production frenzy = 10 + 5 × 6 = 40
		expect(accrued.cans).toBe(40);
		expect(accrued.goldenRushBuffKind).toBeNull();
		expect(accrued.goldenRushBuffEndsAt).toBeNull();
		expect(accrued.goldenRushReadyAt?.getTime()).toBeGreaterThanOrEqual(10_000);
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
			{ action: "pick_draft", operationId, optionIndex: 2 },
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
			{ action: "pick_draft", operationId, optionIndex: 3 },
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

	test("rebases simulated Golden Rush timers to real server time", () => {
		const now = new Date(10_000);
		const state = createDefaultGameState("user", now);
		state.goldenRushReadyAt = new Date(15_000);
		state.goldenRushBuffKind = "click_rush";
		state.goldenRushBuffEndsAt = new Date(18_000);

		const advanced = advanceOpenState(state, 2000, now);
		expect(advanced.goldenRushReadyAt?.getTime()).toBe(13_000);
		expect(advanced.goldenRushBuffEndsAt?.getTime()).toBe(16_000);
		expect(advanced.goldenRushBuffKind).toBe("click_rush");
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
			draftTier: 0,
			frenzyEndsAt: null,
			goldenCans: state.goldenCans,
			goldenRushBuffEndsAt: null,
			goldenRushBuffKind: null,
			goldenRushReadyAt: null,
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
			runDraft: null,
			runUpgrades: state.runUpgrades,
			serverNow: 0,
			totalGoldenCans: state.totalGoldenCans,
		};
		const observation = createAgentGameObservation(state, snapshot, [], {
			action: "observe",
			replayed: false,
		});
		expect(observation.stats.manualClicksAvailable).toBe(20);
		expect(observation.draft).toBeNull();
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

		const drafted = createDefaultGameState("user", new Date(0));
		drafted.draftTier = 0;
		drafted.runDraft = [
			"ultra-white",
			"draft-spare-pull-tabs",
			"draft-frenzy-chug",
		];
		const draftedObservation = createAgentGameObservation(
			drafted,
			{ ...snapshot, draftTier: 0, runDraft: drafted.runDraft },
			[],
			{ action: "observe", replayed: false }
		);
		expect(draftedObservation.draft?.tier).toBe(0);
		expect(draftedObservation.draft?.options.map(({ id }) => id)).toEqual(
			drafted.runDraft
		);
		expect(
			draftedObservation.legalActions.filter(
				({ action }) => action === "pick_draft"
			)
		).toHaveLength(3);
		expect(
			draftedObservation.shop.runUpgrades.some(({ id }) =>
				id.startsWith("draft-")
			)
		).toBe(false);
		expect(
			draftedObservation.shop.runUpgrades.some(({ id }) => id === "ultra-white")
		).toBe(false);
	});
});
