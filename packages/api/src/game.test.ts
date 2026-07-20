import { describe, expect, test } from "bun:test";

import {
	acceptManualClicks,
	calculateClickValue,
	calculateCps,
	calculateIdleGain,
	cheapestAffordableProducer,
	clampGameValue,
	countUnlockedAchievements,
	createHeadStartProducers,
	createInitialGoldenUpgrades,
	createInitialProducers,
	FRENZY_DURATION_MS,
	formatGameNumber,
	frenzyDurationMs,
	frenzyMultiplier,
	type GameProgress,
	GOLDEN_RUSH_MAX_DELAY_MS,
	GOLDEN_RUSH_MIN_DELAY_MS,
	GOLDEN_UPGRADES,
	goldenCanPotential,
	goldenUpgradeCost,
	luckyCanGain,
	MAX_GAME_VALUE,
	nextGoldenCanRequirement,
	offlineProductionMultiplier,
	prestigeReward,
	producerBulkCost,
	producerCost,
	productionTimeMs,
	RUN_UPGRADES,
	rollGoldenRushDelayMs,
	rollGoldenRushReward,
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
		// production: 0.1 × 25 × 2 × 2 (milestones) × 1.01 (Stocked Up achievement)
		expect(calculateCps(progress)).toBeCloseTo(10.1);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-10")?.cost).toBe(450);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-25")?.cost).toBe(
			3750
		);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-100")?.cost).toBe(
			375_000
		);
		expect(RUN_UPGRADES.find(({ id }) => id === "pull-tab-300")?.cost).toBe(
			3_750_000_000
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
		// 100 base CPS × 1.04 (four producer-count/century achievements)
		expect(calculateCps(progress)).toBeCloseTo(104);
		expect(calculateClickValue(progress)).toBeCloseTo(1 + 104 * 0.02);
	});

	test("composes milestone, flavor, golden, and prestige multipliers", () => {
		const progress = createProgress();
		progress.runUpgrades.push("cold-can", "firm-grip", "pull-tab-25");
		progress.producers["pull-tab"] = 25;
		progress.goldenUpgrades["golden-grip"] = 2;
		progress.goldenUpgrades["endless-chill"] = 2;
		progress.goldenUpgrades["auto-tapper"] = 2;
		progress.goldenUpgrades["golden-reactor"] = 1;
		// production: 0.1 × 25 × 2 (milestone) × 1.3 (chill) × 2 (reactor)
		// × 1.01 (Stocked Up achievement) = 13.13
		expect(calculateClickValue(progress)).toBe(6);
		expect(calculateCps(progress)).toBeCloseTo(13.13 + 2 * 6);
		progress.runUpgrades.push("ultra-white");
		expect(calculateCps(progress)).toBeCloseTo(26 * 1.01 + 2 * 6);
		progress.totalGoldenCans = 100;
		// flavor-doubled production 26 × (1 + 100 × 0.01) = 52, then ×1.02 for
		// the Stocked Up and Golden Pocket achievements
		expect(calculateCps(progress)).toBeCloseTo(52 * 1.02 + 2 * 6);
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

	test("prices sink golden upgrades on exponential curves", () => {
		expect(goldenUpgradeCost("overcharge-core", 0)).toBe(500);
		expect(goldenUpgradeCost("overcharge-core", 3)).toBe(32_000);
		expect(goldenUpgradeCost("frenzy-core", 2)).toBe(25_000);
		expect(goldenUpgradeCost("head-start", 1)).toBe(1000);
		expect(goldenUpgradeCost("frenzy-chronometer", 4)).toBe(8100);
	});

	test("scales frenzy and offline modifiers with golden ranks", () => {
		const progress = createProgress();
		expect(frenzyMultiplier(progress)).toBe(10);
		expect(frenzyDurationMs(progress)).toBe(8000);
		expect(offlineProductionMultiplier(progress)).toBeCloseTo(0.1);
		progress.goldenUpgrades["frenzy-core"] = 4;
		progress.goldenUpgrades["frenzy-chronometer"] = 5;
		progress.goldenUpgrades["time-capsule"] = 3;
		expect(frenzyMultiplier(progress)).toBe(30);
		expect(frenzyDurationMs(progress)).toBe(18_000);
		expect(offlineProductionMultiplier(progress)).toBeCloseTo(0.8);
	});

	test("multiplies production by overcharge ranks", () => {
		const progress = createProgress();
		progress.producers["mini-fridge"] = 1;
		expect(calculateCps(progress)).toBe(1);
		progress.goldenUpgrades["overcharge-core"] = 5;
		expect(calculateCps(progress)).toBe(32);
	});

	test("sums bulk producer purchases unit by unit", () => {
		let expected = 0;
		for (let index = 0; index < 10; index += 1) {
			expected += producerCost("pull-tab", index);
		}
		expect(producerBulkCost("pull-tab", 0, 10)).toBe(expected);
		expect(producerBulkCost("pull-tab", 0, 1)).toBe(15);
	});

	test("stocks head-start producers for the classic lineup only", () => {
		const goldenUpgrades = createInitialGoldenUpgrades();
		expect(createHeadStartProducers(goldenUpgrades)["pull-tab"]).toBe(0);
		goldenUpgrades["head-start"] = 2;
		const producers = createHeadStartProducers(goldenUpgrades);
		expect(producers["pull-tab"]).toBe(25);
		expect(producers["monster-singularity"]).toBe(25);
		expect(producers["taurine-comet"]).toBe(0);
	});

	test("counts achievements from lifetime, producers, and prestige", () => {
		const progress = createProgress();
		expect(countUnlockedAchievements(progress)).toBe(0);
		progress.producers["pull-tab"] = 100;
		expect(countUnlockedAchievements(progress)).toBe(4);
		expect(
			countUnlockedAchievements({
				...progress,
				lifetimeCans: 1e9,
				prestigeLevel: 3,
			})
		).toBe(8);
	});
});

describe("golden can rush", () => {
	test("rolls spawn delays inside the configured window", () => {
		expect(rollGoldenRushDelayMs(0)).toBe(GOLDEN_RUSH_MIN_DELAY_MS);
		expect(rollGoldenRushDelayMs(1)).toBe(GOLDEN_RUSH_MAX_DELAY_MS);
		expect(rollGoldenRushDelayMs(0.5)).toBe(300_000);
	});

	test("rolls lucky, click rush, and production frenzy rewards", () => {
		const progress = createProgress();
		progress.producers["mini-fridge"] = 9;
		const lucky = rollGoldenRushReward(progress, 1_000_000, 0.1);
		expect(lucky.kind).toBe("lucky");
		if (lucky.kind === "lucky") {
			expect(lucky.cans).toBe(8100);
		}
		const clickRush = rollGoldenRushReward(progress, 0, 0.5);
		expect(clickRush.kind).toBe("click_rush");
		if (clickRush.kind === "click_rush") {
			expect(clickRush.multiplier).toBe(777);
			expect(clickRush.durationMs).toBe(15_000);
		}
		const frenzy = rollGoldenRushReward(progress, 0, 0.99);
		expect(frenzy.kind).toBe("production_frenzy");
		if (frenzy.kind === "production_frenzy") {
			expect(frenzy.multiplier).toBe(7);
			expect(frenzy.durationMs).toBe(77_000);
		}
	});

	test("caps lucky gains by bank percent with a click-value floor", () => {
		const progress = createProgress();
		expect(luckyCanGain(progress, 0)).toBe(100);
		progress.producers["mini-fridge"] = 9;
		expect(luckyCanGain(progress, 1_000_000)).toBe(8100);
		expect(luckyCanGain(progress, 10_000)).toBe(1500);
	});

	test("stacks frenzy and production buffs multiplicatively", () => {
		const progress = createProgress();
		expect(productionTimeMs(progress, 10_000, 0)).toBe(10_000);
		expect(productionTimeMs(progress, 10_000, 4000)).toBe(46_000);
		expect(productionTimeMs(progress, 10_000, 4000, 6000, 7)).toBe(298_000);
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
