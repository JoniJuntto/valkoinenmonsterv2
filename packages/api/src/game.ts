export const MAX_GAME_VALUE = 1e300;
export const FRENZY_MULTIPLIER = 10;
export const FRENZY_DURATION_MS = 8000;
export const GOLDEN_CAN_BASE = 1_000_000;
export const MANUAL_CLICKS_PER_SECOND = 20;
export const MAX_MANUAL_CLICK_BUDGET = 120;
export const OFFLINE_PRODUCTION_MULTIPLIER = 0.1;
export const CLICK_UPGRADE_MULTIPLIER = 2;
export const CPS_CLICK_PERCENT = 0.01;
export const GOLDEN_CAN_PRODUCTION_BONUS = 0.01;

export const PRODUCERS = [
	{ baseCost: 15, baseCps: 0.1, id: "pull-tab", name: "Pull Tab" },
	{ baseCost: 100, baseCps: 1, id: "mini-fridge", name: "Mini Fridge" },
	{
		baseCost: 1100,
		baseCps: 8,
		id: "vending-machine",
		name: "Vending Machine",
	},
	{ baseCost: 12_000, baseCps: 47, id: "corner-shop", name: "Corner Shop" },
	{
		baseCost: 130_000,
		baseCps: 260,
		id: "can-warehouse",
		name: "Can Warehouse",
	},
	{
		baseCost: 1_400_000,
		baseCps: 1400,
		id: "filling-line",
		name: "Filling Line",
	},
	{
		baseCost: 20_000_000,
		baseCps: 7800,
		id: "monster-mine",
		name: "Monster Mine",
	},
	{
		baseCost: 330_000_000,
		baseCps: 44_000,
		id: "white-reactor",
		name: "White Reactor",
	},
	{
		baseCost: 5_100_000_000,
		baseCps: 260_000,
		id: "can-portal",
		name: "Can Portal",
	},
	{
		baseCost: 75_000_000_000,
		baseCps: 1_600_000,
		id: "monster-singularity",
		name: "Monster Singularity",
	},
] as const;

export type ProducerId = (typeof PRODUCERS)[number]["id"];
export type ProducerCounts = Record<ProducerId, number>;

export type RunUpgradeKind = "click" | "cps-click" | "flavor" | "milestone";

export interface RunUpgradeDefinition {
	cost: number;
	description: string;
	id: string;
	kind: RunUpgradeKind;
	name: string;
	producerId?: ProducerId;
	requiredOwned?: number;
}

export const CLICK_UPGRADES: RunUpgradeDefinition[] = [
	{ cost: 100, id: "cold-can", name: "Cold Can" },
	{ cost: 1000, id: "firm-grip", name: "Firm Grip" },
	{ cost: 10_000, id: "steel-finger", name: "Steel Finger" },
	{ cost: 100_000, id: "titanium-tab", name: "Titanium Tab" },
	{ cost: 1_000_000, id: "golden-knuckle", name: "Golden Knuckle" },
	{ cost: 10_000_000, id: "platinum-palm", name: "Platinum Palm" },
	{ cost: 100_000_000, id: "diamond-fist", name: "Diamond Fist" },
	{ cost: 1_000_000_000, id: "plasma-punch", name: "Plasma Punch" },
	{ cost: 10_000_000_000, id: "singularity-touch", name: "Singularity Touch" },
].map((upgrade) => ({
	...upgrade,
	description: "2× cans per click",
	kind: "click",
}));

export const CPS_CLICK_UPGRADES: RunUpgradeDefinition[] = [
	{ cost: 50_000_000, id: "sticky-fingers", name: "Sticky Fingers" },
	{ cost: 5_000_000_000, id: "monster-reflexes", name: "Monster Reflexes" },
	{ cost: 500_000_000_000, id: "caffeine-overload", name: "Caffeine Overload" },
].map((upgrade) => ({
	...upgrade,
	description: "Clicks also earn +1% of your cans per second",
	kind: "cps-click",
}));

export const FLAVOR_UPGRADES: RunUpgradeDefinition[] = [
	{ cost: 1_000_000, id: "ultra-white", name: "Ultra White" },
	{ cost: 50_000_000, id: "ultra-blue", name: "Ultra Blue" },
	{ cost: 2_500_000_000, id: "ultra-rosa", name: "Ultra Rosa" },
	{ cost: 125_000_000_000, id: "ultra-gold", name: "Ultra Gold" },
	{ cost: 6_250_000_000_000, id: "ultra-paradise", name: "Ultra Paradise" },
	{ cost: 312_500_000_000_000, id: "ultra-black", name: "Ultra Black" },
].map((upgrade) => ({
	...upgrade,
	description: "Double all production",
	kind: "flavor",
}));

export const MILESTONES = [10, 25, 50, 100] as const;
const MILESTONE_COST_MULTIPLIERS = [30, 250, 2500, 25_000] as const;

const milestoneUpgrades: RunUpgradeDefinition[] = PRODUCERS.flatMap(
	(producer) =>
		MILESTONES.map((requiredOwned, index) => ({
			cost: producer.baseCost * (MILESTONE_COST_MULTIPLIERS[index] ?? 1),
			description: `Double ${producer.name} production`,
			id: `${producer.id}-${requiredOwned}`,
			kind: "milestone" as const,
			name: `${producer.name} ${requiredOwned}`,
			producerId: producer.id,
			requiredOwned,
		}))
);

export const RUN_UPGRADES: RunUpgradeDefinition[] = [
	...CLICK_UPGRADES,
	...CPS_CLICK_UPGRADES,
	...FLAVOR_UPGRADES,
	...milestoneUpgrades,
];

export const GOLDEN_UPGRADES = [
	{
		baseCost: 1,
		description: "+25% click power per rank",
		id: "golden-grip",
		maxRank: 10,
		name: "Golden Grip",
		unlockLevel: 1,
	},
	{
		baseCost: 1,
		description: "+15% cans per second per rank",
		id: "endless-chill",
		maxRank: 10,
		name: "Endless Chill",
		unlockLevel: 1,
	},
	{
		baseCost: 4,
		description: "+1 automatic click per second per rank",
		id: "auto-tapper",
		maxRank: 5,
		name: "Auto Tapper",
		unlockLevel: 2,
	},
	{
		baseCost: 5,
		description: "+25% frenzy frequency per rank",
		id: "frenzy-magnet",
		maxRank: 5,
		name: "Frenzy Magnet",
		unlockLevel: 3,
	},
	{
		baseCost: 40,
		description:
			"Buy the cheapest affordable producer every 5 seconds while open",
		id: "smart-stocker",
		maxRank: 1,
		name: "Smart Stocker",
		unlockLevel: 4,
	},
	{
		baseCost: 100,
		description: "Double all production",
		id: "golden-reactor",
		maxRank: 1,
		name: "Golden Reactor",
		unlockLevel: 6,
	},
	{
		baseCost: 250,
		description: "Double offline production",
		id: "time-capsule",
		maxRank: 1,
		name: "Time Capsule",
		unlockLevel: 8,
	},
] as const;

export type GoldenUpgradeId = (typeof GOLDEN_UPGRADES)[number]["id"];
export type GoldenUpgradeRanks = Record<GoldenUpgradeId, number>;

export interface GameProgress {
	goldenUpgrades: GoldenUpgradeRanks;
	producers: ProducerCounts;
	runUpgrades: string[];
	totalGoldenCans: number;
}

export interface GameSnapshot extends GameProgress {
	bestRunCans: number;
	cans: number;
	frenzyEndsAt: number | null;
	goldenCans: number;
	idleReport: {
		cansEarned: number;
		elapsedMs: number;
		hadFrenzy: boolean;
	} | null;
	isAnonymous: boolean;
	isShadowBanned: boolean;
	lastAccruedAt: number;
	lifetimeCans: number;
	nextFrenzyClick: number;
	prestigeLevel: number;
	revision: number;
	runCans: number;
	serverNow: number;
}

const producerIds = new Set<string>(PRODUCERS.map(({ id }) => id));
const runUpgradeById = new Map(
	RUN_UPGRADES.map((upgrade) => [upgrade.id, upgrade])
);
const goldenUpgradeById = new Map(
	GOLDEN_UPGRADES.map((upgrade) => [upgrade.id, upgrade])
);
const goldenUpgradeIds = new Set<string>(GOLDEN_UPGRADES.map(({ id }) => id));
const compactNumberFormatter = new Intl.NumberFormat("en", {
	maximumFractionDigits: 2,
	notation: "compact",
});
const scientificNumberFormatter = new Intl.NumberFormat("en", {
	maximumFractionDigits: 2,
	notation: "scientific",
});

export const createInitialProducers = (): ProducerCounts => ({
	"can-portal": 0,
	"can-warehouse": 0,
	"corner-shop": 0,
	"filling-line": 0,
	"mini-fridge": 0,
	"monster-mine": 0,
	"monster-singularity": 0,
	"pull-tab": 0,
	"vending-machine": 0,
	"white-reactor": 0,
});

export const createInitialGoldenUpgrades = (): GoldenUpgradeRanks => ({
	"auto-tapper": 0,
	"endless-chill": 0,
	"frenzy-magnet": 0,
	"golden-grip": 0,
	"golden-reactor": 0,
	"smart-stocker": 0,
	"time-capsule": 0,
});

export const clampGameValue = (value: number): number => {
	if (Number.isNaN(value) || value <= 0) {
		return 0;
	}
	if (!Number.isFinite(value) || value >= MAX_GAME_VALUE) {
		return MAX_GAME_VALUE;
	}
	return value;
};

export const formatGameNumber = (value: number): string => {
	const safeValue = clampGameValue(value);
	return safeValue >= 1e15
		? scientificNumberFormatter.format(safeValue)
		: compactNumberFormatter.format(safeValue);
};

export const isProducerId = (value: string): value is ProducerId =>
	producerIds.has(value);

export const isRunUpgradeId = (value: string): boolean =>
	runUpgradeById.has(value);

export const isGoldenUpgradeId = (value: string): value is GoldenUpgradeId =>
	goldenUpgradeIds.has(value);

export const getRunUpgrade = (id: string): RunUpgradeDefinition | undefined =>
	runUpgradeById.get(id);

export const getGoldenUpgrade = (id: GoldenUpgradeId) =>
	goldenUpgradeById.get(id);

export const producerCost = (producerId: ProducerId, owned: number): number => {
	const producer = PRODUCERS.find(({ id }) => id === producerId);
	if (!producer) {
		return MAX_GAME_VALUE;
	}
	return clampGameValue(Math.floor(producer.baseCost * 1.15 ** owned));
};

export const cheapestAffordableProducer = (
	progress: GameProgress,
	cans: number
): ProducerId | null => {
	let cheapestId: ProducerId | null = null;
	let cheapestCost = MAX_GAME_VALUE;

	for (const producer of PRODUCERS) {
		const cost = producerCost(producer.id, progress.producers[producer.id]);
		if (cost <= cans && cost < cheapestCost) {
			cheapestCost = cost;
			cheapestId = producer.id;
		}
	}

	return cheapestId;
};

export const goldenUpgradeCost = (
	upgradeId: GoldenUpgradeId,
	rank: number
): number => {
	const upgrade = getGoldenUpgrade(upgradeId);
	return upgrade ? upgrade.baseCost * (rank + 1) : MAX_GAME_VALUE;
};

const hasRunUpgrade = (progress: GameProgress, id: string): boolean =>
	progress.runUpgrades.includes(id);

const countRunUpgradesOfKind = (
	progress: GameProgress,
	kind: RunUpgradeKind
): number => {
	let count = 0;
	for (const id of progress.runUpgrades) {
		if (runUpgradeById.get(id)?.kind === kind) {
			count += 1;
		}
	}
	return count;
};

const producerMultiplier = (
	progress: GameProgress,
	producerId: ProducerId
): number => {
	let multiplier = 1;
	for (const milestone of MILESTONES) {
		if (hasRunUpgrade(progress, `${producerId}-${milestone}`)) {
			multiplier *= 2;
		}
	}
	return multiplier;
};

const reactorMultiplier = (progress: GameProgress): number =>
	progress.goldenUpgrades["golden-reactor"] > 0 ? 2 : 1;

export const calculateProductionCps = (progress: GameProgress): number => {
	let producerCps = 0;
	for (const producer of PRODUCERS) {
		producerCps +=
			producer.baseCps *
			progress.producers[producer.id] *
			producerMultiplier(progress, producer.id);
	}
	producerCps *= 2 ** countRunUpgradesOfKind(progress, "flavor");
	producerCps *= 1 + progress.goldenUpgrades["endless-chill"] * 0.15;
	producerCps *=
		1 + Math.max(0, progress.totalGoldenCans) * GOLDEN_CAN_PRODUCTION_BONUS;
	return clampGameValue(producerCps * reactorMultiplier(progress));
};

export const calculateClickValue = (progress: GameProgress): number => {
	const clickBase =
		CLICK_UPGRADE_MULTIPLIER ** countRunUpgradesOfKind(progress, "click");
	const cpsPercent =
		countRunUpgradesOfKind(progress, "cps-click") * CPS_CLICK_PERCENT;
	const gripMultiplier = 1 + progress.goldenUpgrades["golden-grip"] * 0.25;
	return clampGameValue(
		(clickBase + calculateProductionCps(progress) * cpsPercent) * gripMultiplier
	);
};

export const calculateCps = (progress: GameProgress): number => {
	const autoClickCps =
		progress.goldenUpgrades["auto-tapper"] * calculateClickValue(progress);
	return clampGameValue(calculateProductionCps(progress) + autoClickCps);
};

export const acceptManualClicks = (
	currentBudget: number,
	elapsedMs: number,
	pendingClicks: number
): { acceptedClicks: number; remainingBudget: number } => {
	const availableBudget = Math.min(
		MAX_MANUAL_CLICK_BUDGET,
		Math.max(0, currentBudget) +
			(Math.max(0, elapsedMs) / 1000) * MANUAL_CLICKS_PER_SECOND
	);
	const acceptedClicks = Math.min(
		Math.max(0, Math.floor(pendingClicks)),
		Math.floor(availableBudget)
	);
	return { acceptedClicks, remainingBudget: availableBudget - acceptedClicks };
};

export const calculateIdleGain = (
	progress: GameProgress,
	elapsedMs: number,
	frenzyMs: number,
	productionMultiplier: number
): number => {
	const safeElapsedMs = Math.max(0, elapsedMs);
	const safeFrenzyMs = Math.min(safeElapsedMs, Math.max(0, frenzyMs));
	const normalMs = safeElapsedMs - safeFrenzyMs;
	return clampGameValue(
		calculateCps(progress) *
			((normalMs + safeFrenzyMs * FRENZY_MULTIPLIER) / 1000) *
			Math.max(0, productionMultiplier)
	);
};

export const goldenCanPotential = (lifetimeCans: number): number =>
	Math.floor(Math.sqrt(clampGameValue(lifetimeCans) / GOLDEN_CAN_BASE));

export const prestigeReward = (
	lifetimeCans: number,
	totalGoldenCans: number
): number =>
	Math.max(0, goldenCanPotential(lifetimeCans) - Math.max(0, totalGoldenCans));

export const nextGoldenCanRequirement = (totalGoldenCans: number): number =>
	clampGameValue(GOLDEN_CAN_BASE * (Math.max(0, totalGoldenCans) + 1) ** 2);

export const frenzyChance = (progress: GameProgress): number =>
	0.005 * (1 + progress.goldenUpgrades["frenzy-magnet"] * 0.25);

export const randomFrenzyThreshold = (
	progress: GameProgress,
	randomValue: number
): number => {
	const chance = frenzyChance(progress);
	const safeRandom = Math.min(
		1 - Number.EPSILON,
		Math.max(Number.EPSILON, randomValue)
	);
	return Math.max(
		1,
		Math.ceil(Math.log(1 - safeRandom) / Math.log(1 - chance))
	);
};
