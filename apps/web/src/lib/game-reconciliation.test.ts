import { describe, expect, test } from "bun:test";

import {
	createInitialGoldenUpgrades,
	createInitialProducers,
	type GameSnapshot,
	GOLDEN_RUSH_CLAIM_WINDOW_MS,
	GOLDEN_RUSH_VISIBLE_MS,
} from "@valkoinenmonsterv2/api/game";
import {
	isGoldenRushVisible,
	projectElapsed,
	reconcileMutationFailure,
	reconcileMutationSuccess,
} from "./game-reconciliation";

const createSnapshot = (
	overrides: Partial<GameSnapshot> = {}
): GameSnapshot => ({
	bestRunCans: 0,
	cans: 0,
	frenzyEndsAt: null,
	goldenCans: 0,
	goldenRushBuffEndsAt: null,
	goldenRushBuffKind: null,
	goldenRushReadyAt: null,
	goldenUpgrades: createInitialGoldenUpgrades(),
	idleReport: null,
	isAnonymous: true,
	isShadowBanned: false,
	lastAccruedAt: 1000,
	lifetimeCans: 0,
	nextFrenzyClick: 100,
	prestigeLevel: 0,
	producers: createInitialProducers(),
	revision: 1,
	runCans: 0,
	runUpgrades: [],
	serverNow: 1000,
	totalGoldenCans: 0,
	unlockedAchievements: [],
	...overrides,
});

describe("browser game reconciliation", () => {
	test("replaces local state with success snapshot and projects only new clicks", () => {
		const canonical = createSnapshot({
			cans: 100,
			lifetimeCans: 100,
			runCans: 100,
		});
		const projected = reconcileMutationSuccess(canonical, 1000, {
			queuedDuringRequest: 2,
			sent: 5,
		});

		expect(projected.cans).toBe(102);
		expect(projected.runCans).toBe(102);
		expect(projected.lifetimeCans).toBe(102);
		expect(projected.nextFrenzyClick).toBe(98);
		expect(projected.revision).toBe(1);
	});

	test("restores sent and newly queued clicks after a failed mutation", () => {
		const refreshed = createSnapshot({
			cans: 100,
			lifetimeCans: 100,
			revision: 3,
			runCans: 100,
		});
		const reconciliation = reconcileMutationFailure(refreshed, 1000, {
			queuedDuringRequest: 2,
			sent: 5,
		});

		expect(reconciliation.pendingClicks).toBe(7);
		expect(reconciliation.projected.cans).toBe(107);
		expect(reconciliation.projected.nextFrenzyClick).toBe(93);
		expect(reconciliation.projected.revision).toBe(3);
	});

	test("projects elapsed frenzy and production buff gain across all counters", () => {
		const producers = createInitialProducers();
		producers["pull-tab"] = 1;
		const snapshot = createSnapshot({
			bestRunCans: 25,
			cans: 10,
			frenzyEndsAt: 2000,
			goldenRushBuffEndsAt: 2000,
			goldenRushBuffKind: "production_frenzy",
			lifetimeCans: 30,
			producers,
			runCans: 20,
		});
		const projected = projectElapsed(snapshot, 2000);

		expect(projected.cans).toBeCloseTo(17);
		expect(projected.runCans).toBeCloseTo(27);
		expect(projected.lifetimeCans).toBeCloseTo(37);
		expect(projected.bestRunCans).toBeCloseTo(27);
		expect(projected.lastAccruedAt).toBe(2000);
		expect(projected.serverNow).toBe(2000);
	});

	test("limits Golden Rush presentation to its visible interaction period", () => {
		const readyAt = 10_000;
		expect(
			isGoldenRushVisible(
				createSnapshot({ goldenRushReadyAt: readyAt, serverNow: readyAt - 1 })
			)
		).toBe(false);
		expect(
			isGoldenRushVisible(
				createSnapshot({ goldenRushReadyAt: readyAt, serverNow: readyAt })
			)
		).toBe(true);
		expect(
			isGoldenRushVisible(
				createSnapshot({
					goldenRushReadyAt: readyAt,
					serverNow: readyAt + GOLDEN_RUSH_VISIBLE_MS,
				})
			)
		).toBe(true);
		const hiddenDuringClaimGrace = readyAt + GOLDEN_RUSH_VISIBLE_MS + 1;
		expect(hiddenDuringClaimGrace).toBeLessThan(
			readyAt + GOLDEN_RUSH_CLAIM_WINDOW_MS
		);
		expect(
			isGoldenRushVisible(
				createSnapshot({
					goldenRushReadyAt: readyAt,
					serverNow: hiddenDuringClaimGrace,
				})
			)
		).toBe(false);
	});
});
