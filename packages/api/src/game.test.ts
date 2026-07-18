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
	goldenCanPotential,
	goldenUpgradeCost,
	MAX_GAME_VALUE,
	nextGoldenCanRequirement,
	prestigeReward,
	producerCost,
	RUN_UPGRADES,
} from "./game";

const createProgress = (): GameProgress => ({
	goldenUpgrades: createInitialGoldenUpgrades(),
	producers: createInitialProducers(),
	runUpgrades: [],
	totalGoldenCans: 0,
});

describe("Monster game economy", () => {
	test("scales producer prices and milestone production", () => {
		expect(producerCost("pull-tab", 0)).toBe(15);
		expect(producerCost("pull-tab", 1)).toBe(17);
		const progress = createProgress();
		progress.producers["pull-tab"] = 25;
		progress.runUpgrades.push("pull-tab-10", "pull-tab-25");
		expect(calculateCps(progress)).toBe(10);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-10")?.cost).toBe(450);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-25")?.cost).toBe(
			3750
		);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-100")?.cost).toBe(
			375_000
		);
	});

	test("selects the cheapest producer by its current scaled price", () => {
		const progress = createProgress();
		progress.producers["pull-tab"] = 20;
		expect(cheapestAffordableProducer(progress, 100)).toBe("mini-fridge");
		expect(cheapestAffordableProducer(progress, 99)).toBeNull();
	});

	test("doubles click power per click upgrade instead of spiking 10×", () => {
		const progress = createProgress();
		expect(calculateClickValue(progress)).toBe(1);
		progress.runUpgrades.push("cold-can");
		expect(calculateClickValue(progress)).toBe(2);
		progress.runUpgrades.push(
			"firm-grip",
			"steel-finger",
			"titanium-tab",
			"golden-knuckle",
			"platinum-palm",
			"diamond-fist",
			"plasma-punch",
			"singularity-touch"
		);
		expect(calculateClickValue(progress)).toBe(512);
	});

	test("cps-to-click upgrades keep clicking relevant against production", () => {
		const progress = createProgress();
		progress.producers["mini-fridge"] = 100;
		progress.runUpgrades.push("sticky-fingers", "monster-reflexes");
		expect(calculateCps(progress)).toBe(100);
		expect(calculateClickValue(progress)).toBeCloseTo(1 + 100 * 0.02);
	});

	test("composes milestone, flavor, golden, and prestige multipliers", () => {
		const progress = createProgress();
		progress.runUpgrades.push("cold-can", "firm-grip", "pull-tab-25");
		progress.producers["pull-tab"] = 25;
		progress.goldenUpgrades["golden-grip"] = 2;
		progress.goldenUpgrades["endless-chill"] = 2;
		progress.goldenUpgrades["auto-tapper"] = 2;
		progress.goldenUpgrades["golden-reactor"] = 1;
		// production: 0.1 × 25 × 2 (milestone) × 1.3 (chill) × 2 (reactor) = 13
		expect(calculateClickValue(progress)).toBe(6);
		expect(calculateCps(progress)).toBe(25);
		progress.runUpgrades.push("ultra-white");
		expect(calculateCps(progress)).toBe(38);
		progress.totalGoldenCans = 100;
		// flavor-doubled production 26 × (1 + 100 × 0.01) = 52
		expect(calculateCps(progress)).toBe(52 + 2 * 6);
	});

	test("awards golden cans on a square-root curve of lifetime cans", () => {
		expect(goldenCanPotential(999_999)).toBe(0);
		expect(goldenCanPotential(1_000_000)).toBe(1);
		expect(goldenCanPotential(4_000_000)).toBe(2);
		expect(goldenCanPotential(100_000_000)).toBe(10);
		expect(prestigeReward(9_000_000, 0)).toBe(3);
		expect(prestigeReward(9_000_000, 2)).toBe(1);
		expect(prestigeReward(9_000_000, 5)).toBe(0);
		expect(nextGoldenCanRequirement(0)).toBe(1_000_000);
		expect(nextGoldenCanRequirement(2)).toBe(9_000_000);
	});

	test("prices golden upgrades linearly by rank", () => {
		expect(goldenUpgradeCost("golden-grip", 0)).toBe(1);
		expect(goldenUpgradeCost("golden-grip", 9)).toBe(10);
		expect(goldenUpgradeCost("auto-tapper", 0)).toBe(4);
		expect(goldenUpgradeCost("auto-tapper", 4)).toBe(20);
		expect(
			GOLDEN_UPGRADES.find(({ id }) => id === "auto-tapper")?.unlockLevel
		).toBe(2);
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
