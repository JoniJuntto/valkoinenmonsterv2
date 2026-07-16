import { describe, expect, test } from "bun:test";

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
	formatGameNumber,
	type GameProgress,
	GOLDEN_UPGRADES,
	goldenUpgradeCost,
	MAX_GAME_VALUE,
	prestigeRequirement,
	prestigeReward,
	producerCost,
	RUN_UPGRADES,
} from "./game";

const createProgress = (): GameProgress => ({
	goldenUpgrades: createInitialGoldenUpgrades(),
	producers: createInitialProducers(),
	runUpgrades: [],
});

describe("Monster game economy", () => {
	test("scales producer prices and milestone production", () => {
		expect(producerCost("pull-tab", 0)).toBe(15);
		expect(producerCost("pull-tab", 1)).toBe(17);
		const progress = createProgress();
		progress.producers["pull-tab"] = 25;
		progress.runUpgrades.push("pull-tab-25");
		expect(calculateCps(progress)).toBe(5);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-25")?.cost).toBe(
			1500
		);
	});

	test("selects the cheapest producer by its current scaled price", () => {
		const progress = createProgress();
		progress.producers["pull-tab"] = 20;
		expect(cheapestAffordableProducer(progress, 100)).toBe("mini-fridge");
		expect(cheapestAffordableProducer(progress, 99)).toBeNull();
	});

	test("composes click, production, automation, and permanent multipliers", () => {
		const progress = createProgress();
		progress.runUpgrades.push("cold-can", "firm-grip", "pull-tab-25");
		progress.producers["pull-tab"] = 25;
		progress.goldenUpgrades["golden-grip"] = 2;
		progress.goldenUpgrades["endless-chill"] = 2;
		progress.goldenUpgrades["auto-tapper"] = 2;
		progress.goldenUpgrades["golden-reactor"] = 1;
		expect(calculateClickValue(progress)).toBe(300);
		expect(calculateCps(progress)).toBe(613);
	});

	test("calculates prestige and golden upgrade costs", () => {
		expect(prestigeRequirement(0)).toBe(100_000);
		expect(prestigeRequirement(1)).toBe(200_000);
		expect(prestigeRequirement(2)).toBe(400_000);
		expect(prestigeReward(99_999, 0)).toBe(0);
		expect(prestigeReward(100_000, 0)).toBe(1);
		expect(prestigeReward(299_999, 0)).toBe(1);
		expect(prestigeReward(300_000, 0)).toBe(2);
		expect(prestigeReward(600_000, 1)).toBe(2);
		expect(goldenUpgradeCost("auto-tapper", 0)).toBe(4);
		expect(goldenUpgradeCost("auto-tapper", 4)).toBe(64);
		expect(
			GOLDEN_UPGRADES.find(({ id }) => id === "auto-tapper")?.unlockLevel
		).toBe(5);
	});

	test("clamps and formats large values", () => {
		expect(clampGameValue(Number.POSITIVE_INFINITY)).toBe(MAX_GAME_VALUE);
		expect(clampGameValue(Number.NEGATIVE_INFINITY)).toBe(0);
		expect(clampGameValue(Number.NaN)).toBe(0);
		expect(formatGameNumber(1500)).toBe("1.5K");
		expect(formatGameNumber(1e15)).toContain("E15");
	});
});

describe("validated accrual", () => {
	test("enforces the click budget across batched syncs", () => {
		const firstBatch = acceptManualClicks(20, 5000, 200);
		expect(firstBatch).toEqual({ acceptedClicks: 120, remainingBudget: 0 });
		expect(
			acceptManualClicks(firstBatch.remainingBudget, 0, 10).acceptedClicks
		).toBe(0);
		expect(acceptManualClicks(0, 1000, 50).acceptedClicks).toBe(20);
	});

	test("applies exact frenzy and offline multipliers", () => {
		const progress = createProgress();
		progress.producers["mini-fridge"] = 1;
		expect(FRENZY_DURATION_MS).toBe(8000);
		expect(calculateIdleGain(progress, 10_000, 2000, 1)).toBe(28);
		expect(calculateIdleGain(progress, 10_000, 2000, 2)).toBe(56);
		expect(calculateIdleGain(progress, 10_000, 2000, 0.1)).toBeCloseTo(2.8);
	});
});
