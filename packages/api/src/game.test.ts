import { describe, expect, test } from "bun:test";

import {
	ASCENSION_NODES,
	acceptManualClicks,
	activeFrenzyMultiplier,
	ascensionNodeCost,
	ascensionNodeUnlocked,
	ascensionPotential,
	ascensionReward,
	bestStockerPurchase,
	CAN_VARIANTS,
	COLLECTION_SETS,
	calculateClickValue,
	calculateCps,
	calculateIdleGain,
	calculateProductionCps,
	clampGameValue,
	collectionMultiplier,
	collectUnlockedVariants,
	completedCollectionSets,
	countUnlockedAchievements,
	createHeadStartProducers,
	createInitialAscensionNodes,
	createInitialGoldenUpgrades,
	createInitialProducers,
	createStartingRunUpgrades,
	derivedCanVariantIds,
	FLAVOR_UPGRADES,
	FRENZY_DURATION_MS,
	formatGameNumber,
	frenzyDurationMs,
	frenzyMultiplier,
	type GameProgress,
	GOLDEN_RUSH_DROP_CHANCE,
	GOLDEN_RUSH_MAX_DELAY_MS,
	GOLDEN_RUSH_MIN_DELAY_MS,
	GOLDEN_UPGRADES,
	goldenCanPotential,
	goldenUpgradeCost,
	goldenUpgradeUnlockLevel,
	isProducerId,
	luckyCanGain,
	MAX_GAME_VALUE,
	MAX_PERSISTED_COUNTER,
	nextGoldenCanRequirement,
	offlineProductionMultiplier,
	PRODUCER_SYNERGIES,
	PRODUCERS,
	prestigeReward,
	producerBulkCost,
	producerCost,
	productionTimeMs,
	RUN_UPGRADES,
	rollGoldenRushDelayMs,
	rollGoldenRushDrop,
	rollGoldenRushReward,
	unionCollection,
	unlockedAchievementIds,
} from "./game";

const createProgress = (): GameProgress => ({
	collection: [],
	goldenUpgrades: createInitialGoldenUpgrades(),
	producers: createInitialProducers(),
	runUpgrades: [],
	totalGoldenCans: 0,
});

describe("ascension layer", () => {
	test("derives sparks from total golden cans without re-farming", () => {
		expect(ascensionPotential(0)).toBe(0);
		expect(ascensionPotential(24)).toBe(0);
		expect(ascensionPotential(25)).toBe(1);
		expect(ascensionPotential(100)).toBe(2);
		expect(ascensionPotential(2500)).toBe(10);
		expect(ascensionReward(24, 0)).toBe(0);
		expect(ascensionReward(100, 0)).toBe(2);
		expect(ascensionReward(100, 2)).toBe(0);
		expect(ascensionReward(2500, 2)).toBe(8);
	});

	test("prices and gates ascension nodes", () => {
		const findNode = (id: string) => {
			const node = ASCENSION_NODES.find((entry) => entry.id === id);
			if (!node) {
				throw new Error(`Missing node: ${id}`);
			}
			return node;
		};
		const nodes = createInitialAscensionNodes();
		expect(ascensionNodeCost("second-nature", 0)).toBe(1);
		expect(ascensionNodeCost("second-nature", 2)).toBe(4);
		expect(ascensionNodeCost("master-key", 1)).toBe(4);
		expect(ascensionNodeCost("second-wind", 0)).toBe(5);
		expect(ascensionNodeUnlocked(nodes, findNode("second-nature"))).toBe(true);
		expect(ascensionNodeUnlocked(nodes, findNode("second-wind"))).toBe(false);
		nodes["second-nature"] = 1;
		expect(ascensionNodeUnlocked(nodes, findNode("second-wind"))).toBe(true);
		expect(ascensionNodeUnlocked(nodes, findNode("frenzy-stacking"))).toBe(
			false
		);
		nodes["master-key"] = 1;
		expect(ascensionNodeUnlocked(nodes, findNode("frenzy-stacking"))).toBe(
			true
		);
	});

	test("second nature starts runs with cheap non-milestone upgrades", () => {
		const nodes = createInitialAscensionNodes();
		expect(createStartingRunUpgrades(nodes)).toEqual([]);
		nodes["second-nature"] = 2;
		expect(createStartingRunUpgrades(nodes)).toEqual(["cold-can", "firm-grip"]);
	});

	test("master key lowers golden upgrade prestige gates", () => {
		const nodes = createInitialAscensionNodes();
		expect(goldenUpgradeUnlockLevel({ unlockLevel: 2 }, nodes)).toBe(2);
		nodes["master-key"] = 1;
		expect(goldenUpgradeUnlockLevel({ unlockLevel: 2 }, nodes)).toBe(1);
		nodes["master-key"] = 5;
		expect(goldenUpgradeUnlockLevel({ unlockLevel: 2 }, nodes)).toBe(1);
	});

	test("stacked frenzies double the frenzy multiplier", () => {
		const progress = createProgress();
		expect(activeFrenzyMultiplier(progress, 1)).toBe(10);
		expect(activeFrenzyMultiplier(progress, 2)).toBe(20);
		progress.goldenUpgrades["frenzy-core"] = 2;
		expect(activeFrenzyMultiplier(progress, 2)).toBe(40);
	});

	test("extends production time by the stacked frenzy boost", () => {
		const progress = createProgress();
		expect(productionTimeMs(progress, 10_000, 4000, 0, 1, 1)).toBe(46_000);
		expect(productionTimeMs(progress, 10_000, 4000, 0, 1, 2)).toBe(86_000);
		progress.producers["mini-fridge"] = 1;
		expect(calculateIdleGain(progress, 10_000, 4000, 1, 0, 1, 2)).toBe(86);
	});
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

	test("selects the best value producer instead of the cheapest", () => {
		const progress = createProgress();
		progress.producers["pull-tab"] = 30;
		progress.producers["mini-fridge"] = 10;
		// Pull Tab #31 costs ~993 cans for 0.1 CPS and Mini Fridge #11 ~404 cans
		// for 1 CPS, while a Vending Machine costs 1100 for 8 CPS (+ synergy on
		// Pull Tabs) — best value per can wins over lowest price.
		expect(bestStockerPurchase(progress, 1500)).toBe("vending-machine");
		expect(bestStockerPurchase(createProgress(), 14)).toBeNull();
	});

	test("synergies flip the stocker's best purchase", () => {
		const progress = createProgress();
		progress.producers["vending-machine"] = 50;
		// A Mini Fridge (100 cans, 1 CPS) boosts 50 Vending Machines by +1%:
		// 6 CPS for 100 cans beats a 15-can Pull Tab's 0.1 CPS.
		expect(bestStockerPurchase(progress, 200)).toBe("mini-fridge");
	});

	test("every producer boosts a different producer", () => {
		const targets = PRODUCERS.map(({ id }) => PRODUCER_SYNERGIES[id]);
		// 18 distinct, valid, non-self targets => a fixed-point-free permutation.
		expect(new Set(targets).size).toBe(PRODUCERS.length);
		for (const { id } of PRODUCERS) {
			expect(isProducerId(PRODUCER_SYNERGIES[id])).toBe(true);
			expect(PRODUCER_SYNERGIES[id]).not.toBe(id);
		}
		expect(PRODUCER_SYNERGIES["vending-machine"]).toBe("pull-tab");
		expect(PRODUCER_SYNERGIES["monster-singularity"]).toBe("can-portal");
	});

	test("producer synergies boost a different producer's output", () => {
		const progress = createProgress();
		progress.producers["pull-tab"] = 10;
		progress.runUpgrades.push("pull-tab-10");
		// 0.1 × 10 × 2 (milestone) × 1.01 (Stocked Up) = 2.02 CPS
		expect(calculateCps(progress)).toBeCloseTo(2.02);
		progress.producers["vending-machine"] = 1;
		// Vending Machine boosts Pull Tab +1%: (2.02 × 1.01 + 8 × 1.01) = 10.1202
		expect(calculateCps(progress)).toBeCloseTo(10.1202, 3);
		progress.producers["vending-machine"] = 2;
		// +2%: (2.02 × 1.02 + 16) × 1.01 = 18.2204
		expect(calculateCps(progress)).toBeCloseTo(18.2204, 3);
	});

	test("keeps each producer base price within ten minutes of base output", () => {
		for (const producer of PRODUCERS) {
			expect(producer.baseCost / producer.baseCps).toBeLessThanOrEqual(600);
		}
		expect(producerCost("the-beast", 0)).toBe(1_680_000_000_000_000);
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
		expect(prestigeReward(9_000_000, 2.9)).toBe(1);
		expect(nextGoldenCanRequirement(2.9)).toBe(9_000_000);
	});

	test("paces global and cps-click upgrades on regular cost steps", () => {
		const flavorCosts = RUN_UPGRADES.filter(
			({ kind }) => kind === "flavor"
		).map(({ cost }) => cost);
		for (let index = 1; index < flavorCosts.length; index += 1) {
			expect(flavorCosts[index]).toBe((flavorCosts[index - 1] ?? 0) * 10);
		}

		const cpsClickCosts = RUN_UPGRADES.filter(
			({ kind }) => kind === "cps-click"
		).map(({ cost }) => cost);
		for (let index = 1; index < cpsClickCosts.length; index += 1) {
			expect(cpsClickCosts[index]).toBe((cpsClickCosts[index - 1] ?? 0) * 20);
		}
	});

	test("never grants already-collected prestige potential", () => {
		expect(prestigeReward(9_000_000, 3)).toBe(0);
		expect(prestigeReward(9_000_000, 4)).toBe(0);
		expect(goldenCanPotential(MAX_GAME_VALUE)).toBe(MAX_PERSISTED_COUNTER);
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
		expect(producerBulkCost("pull-tab", 0, -1)).toBe(0);
		expect(producerBulkCost("pull-tab", 0, 1.9)).toBe(15);
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

	test("keeps unlocked achievements through a prestige reset", () => {
		const progress = createProgress();
		progress.producers["pull-tab"] = 100;
		const unlocked = unlockedAchievementIds(progress);
		expect(unlocked).toHaveLength(4);
		const afterPrestige = {
			...createProgress(),
			unlockedAchievements: unlocked,
		};
		expect(countUnlockedAchievements(afterPrestige)).toBe(4);
		expect(unlockedAchievementIds(afterPrestige)).toEqual(unlocked);
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
		expect(clampGameValue(MAX_GAME_VALUE - 1)).toBe(MAX_GAME_VALUE - 1);
		expect(clampGameValue(MAX_GAME_VALUE)).toBe(MAX_GAME_VALUE);
		expect(clampGameValue(MAX_GAME_VALUE * 2)).toBe(MAX_GAME_VALUE);
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

describe("collection codex", () => {
	test("derives flavor and prestige-world unlocks without touching drops", () => {
		const progress = createProgress();
		expect(derivedCanVariantIds(progress)).toEqual([]);
		progress.runUpgrades.push("ultra-white");
		expect(derivedCanVariantIds(progress)).toEqual(["ultra-white"]);
		progress.prestigeLevel = 5;
		expect(derivedCanVariantIds(progress)).toEqual([
			"ultra-white",
			"world-1",
			"world-5",
		]);
		progress.prestigeLevel = 4;
		expect(derivedCanVariantIds(progress)).toEqual(["ultra-white", "world-1"]);
	});

	test("collects unlocks without duplicating known variants", () => {
		const progress = createProgress();
		progress.collection = ["ultra-white"];
		progress.runUpgrades.push("ultra-white", "ultra-blue");
		expect(collectUnlockedVariants(progress)).toEqual([
			"ultra-white",
			"ultra-blue",
		]);
		const same = ["ultra-white", "ultra-blue"];
		expect(unionCollection(same, ["ultra-white"])).toBe(same);
	});

	test("completing sets grants stacking production bonuses", () => {
		expect(collectionMultiplier([])).toBe(1);
		const flavorIds = CAN_VARIANTS.filter(
			({ setId }) => setId === "flavor-family"
		).map(({ id }) => id);
		expect(completedCollectionSets(flavorIds.slice(0, 5))).toEqual([]);
		expect(collectionMultiplier(flavorIds)).toBe(1.25);
		const rushIds = CAN_VARIANTS.filter(
			({ setId }) => setId === "golden-rush"
		).map(({ id }) => id);
		const worldIds = CAN_VARIANTS.filter(
			({ setId }) => setId === "world-exclusives"
		).map(({ id }) => id);
		expect(collectionMultiplier([...flavorIds, ...rushIds])).toBe(1.75);
		expect(collectionMultiplier([...flavorIds, ...rushIds, ...worldIds])).toBe(
			2.75
		);
		expect(
			completedCollectionSets([...flavorIds, ...rushIds, ...worldIds])
		).toEqual(COLLECTION_SETS.map(({ id }) => id));
	});

	test("codex bonus multiplies production", () => {
		const progress = createProgress();
		progress.producers["mini-fridge"] = 1;
		const base = calculateProductionCps(progress);
		progress.collection = CAN_VARIANTS.map(({ id }) => id);
		expect(calculateProductionCps(progress)).toBeCloseTo(base * 2.75);
	});

	test("rolls golden rush drops per reward kind and ownership", () => {
		expect(rollGoldenRushDrop("lucky", 0.1, [])).toBe("golden-flash");
		expect(rollGoldenRushDrop("click_rush", 0.1, [])).toBe("golden-storm");
		expect(rollGoldenRushDrop("production_frenzy", 0.1, [])).toBe(
			"golden-tide"
		);
		expect(rollGoldenRushDrop("lucky", GOLDEN_RUSH_DROP_CHANCE, [])).toBeNull();
		expect(rollGoldenRushDrop("lucky", 0.5, [])).toBeNull();
		expect(rollGoldenRushDrop("lucky", -1, [])).toBeNull();
		expect(rollGoldenRushDrop("lucky", Number.NaN, [])).toBeNull();
		expect(rollGoldenRushDrop("lucky", 0.1, ["golden-flash"])).toBeNull();
	});

	test("keeps the codex catalog consistent", () => {
		const variantIds = new Set(CAN_VARIANTS.map(({ id }) => id));
		expect(variantIds.size).toBe(CAN_VARIANTS.length);
		const setIds = new Set(COLLECTION_SETS.map(({ id }) => id));
		const flavorCount = FLAVOR_UPGRADES.length;
		expect(CAN_VARIANTS.length).toBe(flavorCount + 3 + 4);
		for (const variant of CAN_VARIANTS) {
			expect(setIds.has(variant.setId)).toBe(true);
		}
		for (const flavor of FLAVOR_UPGRADES) {
			expect(variantIds.has(flavor.id)).toBe(true);
		}
	});
});
