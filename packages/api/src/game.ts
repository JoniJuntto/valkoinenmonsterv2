export const MAX_GAME_VALUE = 1e300;
export const MAX_PERSISTED_COUNTER = 2_147_483_647;
export const PRODUCER_COST_GROWTH = 1.15;
export const FRENZY_MULTIPLIER = 10;
export const FRENZY_DURATION_MS = 8000;
export const GOLDEN_CAN_BASE = 1_000_000;
export const MANUAL_CLICKS_PER_SECOND = 20;
export const MAX_MANUAL_CLICK_BUDGET = 120;
export const OFFLINE_ACCRUAL_THRESHOLD_MS = 15_000;
export const OFFLINE_PRODUCTION_MULTIPLIER = 0.1;
export const CLICK_UPGRADE_MULTIPLIER = 2;
export const CPS_CLICK_PERCENT = 0.01;
export const GOLDEN_CAN_PRODUCTION_BONUS = 0.01;
export const ACHIEVEMENT_PRODUCTION_BONUS = 0.01;
export const FRENZY_CORE_BONUS = 5;
export const FRENZY_CHRONOMETER_BONUS_MS = 2000;
export const OVERCHARGE_MULTIPLIER = 2;
export const ASCENSION_SPARK_DIVISOR = 5;
export const ASCENSION_WIND_SECONDS = 300;
export const FRENZY_STACK_BONUS = 2;
export const MAX_FRENZY_STACKS = 2;
export const GOLDEN_RUSH_DROP_CHANCE = 0.25;

export const GOLDEN_RUSH_MIN_DELAY_MS = 180_000;
export const GOLDEN_RUSH_MAX_DELAY_MS = 420_000;
export const GOLDEN_RUSH_VISIBLE_MS = 12_000;
export const GOLDEN_RUSH_CLAIM_WINDOW_MS = 25_000;
export const CLICK_RUSH_MULTIPLIER = 777;
export const CLICK_RUSH_DURATION_MS = 15_000;
export const PRODUCTION_FRENZY_MULTIPLIER = 7;
export const PRODUCTION_FRENZY_DURATION_MS = 77_000;
export const LUCKY_CAN_CPS_SECONDS = 900;
export const LUCKY_CAN_BANK_PERCENT = 0.15;
export const LUCKY_CAN_MIN_CLICKS = 100;

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
		baseCost: 840_000,
		baseCps: 1400,
		id: "filling-line",
		name: "Filling Line",
	},
	{
		baseCost: 4_680_000,
		baseCps: 7800,
		id: "monster-mine",
		name: "Monster Mine",
	},
	{
		baseCost: 26_400_000,
		baseCps: 44_000,
		id: "white-reactor",
		name: "White Reactor",
	},
	{
		baseCost: 156_000_000,
		baseCps: 260_000,
		id: "can-portal",
		name: "Can Portal",
	},
	{
		baseCost: 960_000_000,
		baseCps: 1_600_000,
		id: "monster-singularity",
		name: "Monster Singularity",
	},
	{
		baseCost: 5_760_000_000,
		baseCps: 9_600_000,
		id: "taurine-comet",
		name: "Taurine Comet",
	},
	{
		baseCost: 34_800_000_000,
		baseCps: 58_000_000,
		id: "caffeine-nebula",
		name: "Caffeine Nebula",
	},
	{
		baseCost: 210_000_000_000,
		baseCps: 350_000_000,
		id: "white-hole",
		name: "White Hole",
	},
	{
		baseCost: 1_260_000_000_000,
		baseCps: 2_100_000_000,
		id: "monster-galaxy",
		name: "Monster Galaxy",
	},
	{
		baseCost: 7_560_000_000_000,
		baseCps: 12_600_000_000,
		id: "dimension-dispenser",
		name: "Dimension Dispenser",
	},
	{
		baseCost: 45_600_000_000_000,
		baseCps: 76_000_000_000,
		id: "time-brewery",
		name: "Time Brewery",
	},
	{
		baseCost: 276_000_000_000_000,
		baseCps: 460_000_000_000,
		id: "cosmic-six-pack",
		name: "Cosmic Six-Pack",
	},
	{
		baseCost: 1_680_000_000_000_000,
		baseCps: 2_800_000_000_000,
		id: "the-beast",
		name: "The Beast",
	},
] as const;

export type ProducerId = (typeof PRODUCERS)[number]["id"];
export type ProducerCounts = Record<ProducerId, number>;

export const SYNERGY_BONUS_PER_OWNED = 0.01;

// Every producer boosts exactly one different producer by
// SYNERGY_BONUS_PER_OWNED per unit owned (a permutation with no fixed
// points), so what you buy shapes what your cheaper producers are worth.
export const PRODUCER_SYNERGIES = {
	"caffeine-nebula": "white-hole",
	"can-portal": "monster-galaxy",
	"can-warehouse": "filling-line",
	"corner-shop": "can-warehouse",
	"cosmic-six-pack": "taurine-comet",
	"dimension-dispenser": "time-brewery",
	"filling-line": "monster-mine",
	"mini-fridge": "vending-machine",
	"monster-galaxy": "cosmic-six-pack",
	"monster-mine": "white-reactor",
	"monster-singularity": "can-portal",
	"pull-tab": "corner-shop",
	"taurine-comet": "caffeine-nebula",
	"the-beast": "mini-fridge",
	"time-brewery": "the-beast",
	"vending-machine": "pull-tab",
	"white-hole": "dimension-dispenser",
	"white-reactor": "monster-singularity",
} as const satisfies Record<ProducerId, ProducerId>;

export const PRODUCER_SYNERGY_SOURCES: Record<ProducerId, ProducerId> =
	Object.fromEntries(
		PRODUCERS.map(({ id }) => [PRODUCER_SYNERGIES[id], id])
	) as Record<ProducerId, ProducerId>;

export const ORIGINAL_PRODUCER_LINEUP_SIZE = 10;
export const HEAD_START_COUNTS = [0, 10, 25, 50, 100] as const;

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
	{ cost: 1e11, id: "neutron-grip", name: "Neutron Grip" },
	{ cost: 1e12, id: "quasar-fist", name: "Quasar Fist" },
	{ cost: 1e13, id: "void-touch", name: "Void Touch" },
	{ cost: 1e14, id: "galactic-slap", name: "Galactic Slap" },
	{ cost: 1e15, id: "time-tap", name: "Time Tap" },
	{ cost: 1e16, id: "reality-crusher", name: "Reality Crusher" },
	{ cost: 1e17, id: "omega-finger", name: "Omega Finger" },
	{ cost: 1e18, id: "claw-of-the-beast", name: "Claw of the Beast" },
].map((upgrade) => ({
	...upgrade,
	description: "2× cans per click",
	kind: "click",
}));

export const CPS_CLICK_UPGRADES: RunUpgradeDefinition[] = [
	{ cost: 50_000_000, id: "sticky-fingers", name: "Sticky Fingers" },
	{ cost: 1_000_000_000, id: "monster-reflexes", name: "Monster Reflexes" },
	{ cost: 20_000_000_000, id: "caffeine-overload", name: "Caffeine Overload" },
	{ cost: 400_000_000_000, id: "liquid-lightning", name: "Liquid Lightning" },
	{ cost: 8_000_000_000_000, id: "taurine-trance", name: "Taurine Trance" },
	{
		cost: 160_000_000_000_000,
		id: "hypersonic-hands",
		name: "Hypersonic Hands",
	},
	{ cost: 3_200_000_000_000_000, id: "beast-mode", name: "Beast Mode" },
].map((upgrade) => ({
	...upgrade,
	description: "Clicks also earn +1% of your cans per second",
	kind: "cps-click",
}));

export const FLAVOR_UPGRADES: RunUpgradeDefinition[] = [
	{ cost: 1_000_000, id: "ultra-white", name: "Ultra White" },
	{ cost: 10_000_000, id: "ultra-blue", name: "Ultra Blue" },
	{ cost: 100_000_000, id: "ultra-rosa", name: "Ultra Rosa" },
	{ cost: 1_000_000_000, id: "ultra-gold", name: "Ultra Gold" },
	{ cost: 10_000_000_000, id: "ultra-paradise", name: "Ultra Paradise" },
	{ cost: 100_000_000_000, id: "ultra-black", name: "Ultra Black" },
	{ cost: 1_000_000_000_000, id: "ultra-violet", name: "Ultra Violet" },
	{ cost: 10_000_000_000_000, id: "ultra-red", name: "Ultra Red" },
	{ cost: 100_000_000_000_000, id: "ultra-fiesta", name: "Ultra Fiesta" },
	{
		cost: 1_000_000_000_000_000,
		id: "ultra-watermelon",
		name: "Ultra Watermelon",
	},
	{
		cost: 10_000_000_000_000_000,
		id: "ultra-peachy-keen",
		name: "Ultra Peachy Keen",
	},
	{
		cost: 100_000_000_000_000_000,
		id: "ultra-strawberry-dreams",
		name: "Ultra Strawberry Dreams",
	},
	{ cost: 1_000_000_000_000_000_000, id: "mango-loco", name: "Mango Loco" },
	{
		cost: 10_000_000_000_000_000_000,
		id: "pipeline-punch",
		name: "Pipeline Punch",
	},
].map((upgrade) => ({
	...upgrade,
	description: "Double all production",
	kind: "flavor",
}));

const FLAVOR_VARIANT_COLORS: Record<string, string> = {
	"mango-loco": "#FBBF24",
	"pipeline-punch": "#FB923C",
	"ultra-black": "#1A1A1A",
	"ultra-blue": "#35A7FF",
	"ultra-fiesta": "#F97316",
	"ultra-gold": "#F2C14E",
	"ultra-paradise": "#2EE6A8",
	"ultra-peachy-keen": "#FDBA8C",
	"ultra-red": "#EF4444",
	"ultra-rosa": "#F472B6",
	"ultra-strawberry-dreams": "#F87171",
	"ultra-violet": "#8B5CF6",
	"ultra-watermelon": "#FB7185",
	"ultra-white": "#F5F5F5",
};

export const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300] as const;
const MILESTONE_COST_MULTIPLIERS = [
	30, 250, 2500, 25_000, 250_000, 2_500_000, 25_000_000, 250_000_000,
] as const;

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
		maxRank: 25,
		name: "Golden Grip",
		unlockLevel: 1,
	},
	{
		baseCost: 1,
		description: "+15% cans per second per rank",
		id: "endless-chill",
		maxRank: 25,
		name: "Endless Chill",
		unlockLevel: 1,
	},
	{
		baseCost: 4,
		description: "+1 automatic click per second per rank",
		id: "auto-tapper",
		maxRank: 10,
		name: "Auto Tapper",
		unlockLevel: 2,
	},
	{
		baseCost: 5,
		description: "+25% frenzy frequency per rank",
		id: "frenzy-magnet",
		maxRank: 10,
		name: "Frenzy Magnet",
		unlockLevel: 3,
	},
	{
		baseCost: 40,
		description:
			"Buy the best-value producer every 5 seconds while open (weighs synergies)",
		id: "smart-stocker",
		maxRank: 1,
		name: "Smart Stocker",
		unlockLevel: 4,
	},
	{
		baseCost: 100,
		costGrowth: 3,
		description: "+2 seconds of frenzy duration per rank",
		id: "frenzy-chronometer",
		maxRank: 5,
		name: "Frenzy Chronometer",
		unlockLevel: 5,
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
		baseCost: 200,
		costGrowth: 5,
		description: "Start each run with 10/25/50/100 of the classic producers",
		id: "head-start",
		maxRank: 4,
		name: "Head Start",
		unlockLevel: 6,
	},
	{
		baseCost: 250,
		description: "Double offline production per rank",
		id: "time-capsule",
		maxRank: 3,
		name: "Time Capsule",
		unlockLevel: 8,
	},
	{
		baseCost: 500,
		costGrowth: 4,
		description: "×2 all production per rank",
		id: "overcharge-core",
		maxRank: 8,
		name: "Overcharge Core",
		unlockLevel: 8,
	},
	{
		baseCost: 1000,
		costGrowth: 5,
		description: "+5 frenzy multiplier per rank",
		id: "frenzy-core",
		maxRank: 4,
		name: "Frenzy Core",
		unlockLevel: 9,
	},
] as const;

export type GoldenUpgradeId = (typeof GOLDEN_UPGRADES)[number]["id"];
export type GoldenUpgradeRanks = Record<GoldenUpgradeId, number>;

export interface AscensionNodeDefinition {
	baseCost: number;
	costGrowth?: number;
	description: string;
	id: string;
	maxRank: number;
	name: string;
	requiredNode?: string;
	requiredRank?: number;
}

export const ASCENSION_NODES = [
	{
		baseCost: 1,
		costGrowth: 2,
		description: "Start each run with the first 1/2/3 cheap run upgrades owned",
		id: "second-nature",
		maxRank: 3,
		name: "Second Nature",
	},
	{
		baseCost: 2,
		costGrowth: 2,
		description: "Golden upgrades unlock 1 prestige level earlier per rank",
		id: "master-key",
		maxRank: 2,
		name: "Master Key",
	},
	{
		baseCost: 5,
		description: "Start each run with 5 minutes of production banked",
		id: "second-wind",
		maxRank: 1,
		name: "Second Wind",
		requiredNode: "second-nature",
		requiredRank: 1,
	},
	{
		baseCost: 3,
		description:
			"Frenzies stack: trigger one during a frenzy to double its multiplier and extend it",
		id: "frenzy-stacking",
		maxRank: 1,
		name: "Twin Fizz",
		requiredNode: "master-key",
		requiredRank: 1,
	},
	{
		baseCost: 6,
		description: "Golden rush buffs last twice as long",
		id: "golden-echo",
		maxRank: 1,
		name: "Golden Echo",
		requiredNode: "frenzy-stacking",
		requiredRank: 1,
	},
] as const satisfies readonly AscensionNodeDefinition[];

export type AscensionNodeId = (typeof ASCENSION_NODES)[number]["id"];
export type AscensionNode = (typeof ASCENSION_NODES)[number];
export type AscensionNodeRanks = Record<AscensionNodeId, number>;

export type GoldenRushBuffKind = "click_rush" | "production_frenzy";

export type GoldenRushReward =
	| { cans: number; kind: "lucky" }
	| { durationMs: number; kind: GoldenRushBuffKind; multiplier: number };

export interface GoldenRushBuffState {
	goldenRushBuffEndsAt: number | null;
	goldenRushBuffKind: GoldenRushBuffKind | null;
}

export interface GameProgress {
	collection: string[];
	goldenUpgrades: GoldenUpgradeRanks;
	producers: ProducerCounts;
	runUpgrades: string[];
	totalGoldenCans: number;
}

export interface AchievementProgress extends GameProgress {
	bestRunCans?: number;
	goldenCans?: number;
	lifetimeCans?: number;
	prestigeLevel?: number;
	unlockedAchievements?: string[];
}

export type CollectionSetId =
	| "flavor-family"
	| "golden-rush"
	| "world-exclusives";

export interface CanVariantDefinition {
	color: string;
	description: string;
	id: string;
	name: string;
	requiredPrestigeLevel?: number;
	requiresFlavorId?: string;
	setId: CollectionSetId;
}

export const CAN_VARIANTS: CanVariantDefinition[] = [
	...FLAVOR_UPGRADES.map((flavor) => ({
		color: FLAVOR_VARIANT_COLORS[flavor.id] ?? "#9CA3AF",
		description: `Buy the ${flavor.name} upgrade`,
		id: flavor.id,
		name: flavor.name,
		requiresFlavorId: flavor.id,
		setId: "flavor-family" as const,
	})),
	{
		color: "#FFD700",
		description: "Drop from a Lucky Can golden rush",
		id: "golden-flash",
		name: "Golden Flash",
		setId: "golden-rush",
	},
	{
		color: "#FFA500",
		description: "Drop from a Click Rush golden rush",
		id: "golden-storm",
		name: "Golden Storm",
		setId: "golden-rush",
	},
	{
		color: "#EAB308",
		description: "Drop from a Production Frenzy golden rush",
		id: "golden-tide",
		name: "Golden Tide",
		setId: "golden-rush",
	},
	{
		color: "#A3E635",
		description: "Reach prestige level 1",
		id: "world-1",
		name: "First Steps",
		requiredPrestigeLevel: 1,
		setId: "world-exclusives",
	},
	{
		color: "#38BDF8",
		description: "Reach prestige level 5",
		id: "world-5",
		name: "Rift Reserve",
		requiredPrestigeLevel: 5,
		setId: "world-exclusives",
	},
	{
		color: "#A855F7",
		description: "Reach prestige level 10",
		id: "world-10",
		name: "Singularity Stock",
		requiredPrestigeLevel: 10,
		setId: "world-exclusives",
	},
	{
		color: "#F43F5E",
		description: "Reach prestige level 25",
		id: "world-25",
		name: "Beast Sovereign",
		requiredPrestigeLevel: 25,
		setId: "world-exclusives",
	},
];

const canVariantById = new Map(
	CAN_VARIANTS.map((variant) => [variant.id, variant])
);

export interface CollectionSetDefinition {
	bonus: number;
	description: string;
	id: CollectionSetId;
	name: string;
}

export const COLLECTION_SETS: CollectionSetDefinition[] = [
	{
		bonus: 0.25,
		description: "+25% production",
		id: "flavor-family",
		name: "Flavor Family",
	},
	{
		bonus: 0.5,
		description: "+50% production",
		id: "golden-rush",
		name: "Golden Rush Drops",
	},
	{
		bonus: 1,
		description: "+100% production",
		id: "world-exclusives",
		name: "World Exclusives",
	},
];

const setBonusById = new Map(COLLECTION_SETS.map((set) => [set.id, set.bonus]));

export const isCanVariantId = (value: string): boolean =>
	canVariantById.has(value);

export const getCanVariant = (id: string): CanVariantDefinition | undefined =>
	canVariantById.get(id);

export const derivedCanVariantIds = (
	progress: AchievementProgress
): string[] => {
	const derived: string[] = [];
	for (const variant of CAN_VARIANTS) {
		const unlocked =
			(variant.requiresFlavorId !== undefined &&
				progress.runUpgrades.includes(variant.requiresFlavorId)) ||
			(variant.requiredPrestigeLevel !== undefined &&
				(progress.prestigeLevel ?? 0) >= variant.requiredPrestigeLevel);
		if (unlocked) {
			derived.push(variant.id);
		}
	}
	return derived;
};

export const unionCollection = (
	current: string[],
	additional: readonly string[]
): string[] => {
	const known = new Set(current);
	let changed = false;
	for (const id of additional) {
		if (!known.has(id)) {
			known.add(id);
			changed = true;
		}
	}
	return changed ? [...known] : current;
};

export const collectUnlockedVariants = (
	progress: AchievementProgress
): string[] =>
	unionCollection(progress.collection, derivedCanVariantIds(progress));

export const completedCollectionSets = (
	collection: string[]
): CollectionSetId[] => {
	const owned = new Set(collection);
	return COLLECTION_SETS.filter((set) =>
		CAN_VARIANTS.filter((variant) => variant.setId === set.id).every(
			(variant) => owned.has(variant.id)
		)
	).map((set) => set.id);
};

export const collectionMultiplier = (collection: string[]): number =>
	1 +
	completedCollectionSets(collection).reduce(
		(sum, setId) => sum + (setBonusById.get(setId) ?? 0),
		0
	);

export const GOLDEN_RUSH_DROP_BY_REWARD: Record<
	GoldenRushReward["kind"],
	string
> = {
	click_rush: "golden-storm",
	lucky: "golden-flash",
	production_frenzy: "golden-tide",
};

export const rollGoldenRushDrop = (
	rewardKind: GoldenRushReward["kind"],
	randomValue: number,
	collection: string[]
): string | null => {
	if (!(randomValue >= 0 && randomValue < GOLDEN_RUSH_DROP_CHANCE)) {
		return null;
	}
	const variantId = GOLDEN_RUSH_DROP_BY_REWARD[rewardKind];
	return collection.includes(variantId) ? null : variantId;
};

export interface GameSnapshot extends GameProgress, GoldenRushBuffState {
	ascensionNodes: AscensionNodeRanks;
	ascensionSparks: number;
	bestRunCans: number;
	cans: number;
	frenzyEndsAt: number | null;
	frenzyStacks: number;
	goldenCans: number;
	goldenRushReadyAt: number | null;
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
	totalAscensionSparks: number;
	unlockedAchievements: string[];
}

const producerIds = new Set<string>(PRODUCERS.map(({ id }) => id));
const runUpgradeById = new Map(
	RUN_UPGRADES.map((upgrade) => [upgrade.id, upgrade])
);
const goldenUpgradeById = new Map(
	GOLDEN_UPGRADES.map((upgrade) => [upgrade.id, upgrade])
);
const goldenUpgradeIds = new Set<string>(GOLDEN_UPGRADES.map(({ id }) => id));
const ascensionNodeById = new Map(
	ASCENSION_NODES.map((node) => [node.id, node])
);
const ascensionNodeIds = new Set<string>(ASCENSION_NODES.map(({ id }) => id));
const startingRunUpgradeIds = [...RUN_UPGRADES]
	.filter(({ kind }) => kind !== "milestone")
	.sort((left, right) => left.cost - right.cost)
	.map(({ id }) => id);
const compactNumberFormatter = new Intl.NumberFormat("en", {
	maximumFractionDigits: 2,
	notation: "compact",
});
const scientificNumberFormatter = new Intl.NumberFormat("en", {
	maximumFractionDigits: 2,
	notation: "scientific",
});

export const createInitialProducers = (): ProducerCounts => {
	const producers = {} as ProducerCounts;
	for (const producer of PRODUCERS) {
		producers[producer.id] = 0;
	}
	return producers;
};

export const createInitialGoldenUpgrades = (): GoldenUpgradeRanks => {
	const ranks = {} as GoldenUpgradeRanks;
	for (const upgrade of GOLDEN_UPGRADES) {
		ranks[upgrade.id] = 0;
	}
	return ranks;
};

export const createInitialAscensionNodes = (): AscensionNodeRanks => {
	const ranks = {} as AscensionNodeRanks;
	for (const node of ASCENSION_NODES) {
		ranks[node.id as AscensionNodeId] = 0;
	}
	return ranks;
};

export const createHeadStartProducers = (
	goldenUpgrades: GoldenUpgradeRanks
): ProducerCounts => {
	const producers = createInitialProducers();
	const rank = Math.max(0, goldenUpgrades["head-start"]);
	const startingCount =
		HEAD_START_COUNTS[Math.min(rank, HEAD_START_COUNTS.length - 1)] ?? 0;
	if (startingCount === 0) {
		return producers;
	}
	for (const producer of PRODUCERS.slice(0, ORIGINAL_PRODUCER_LINEUP_SIZE)) {
		producers[producer.id] = startingCount;
	}
	return producers;
};

export const clampGameValue = (value: number): number => {
	if (Number.isNaN(value) || value <= 0) {
		return 0;
	}
	if (!Number.isFinite(value) || value >= MAX_GAME_VALUE) {
		return MAX_GAME_VALUE;
	}
	return value;
};

export const clampGameCounter = (value: number): number =>
	Math.min(
		MAX_PERSISTED_COUNTER,
		Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
	);

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

export const isGoldenRushBuffKind = (
	value: string
): value is GoldenRushBuffKind =>
	value === "click_rush" || value === "production_frenzy";

export const getRunUpgrade = (id: string): RunUpgradeDefinition | undefined =>
	runUpgradeById.get(id);

export const getGoldenUpgrade = (id: GoldenUpgradeId) =>
	goldenUpgradeById.get(id);

export const producerCost = (producerId: ProducerId, owned: number): number => {
	const producer = PRODUCERS.find(({ id }) => id === producerId);
	if (!producer) {
		return MAX_GAME_VALUE;
	}
	const safeOwned = Math.max(0, Math.floor(owned));
	return clampGameValue(
		Math.floor(producer.baseCost * PRODUCER_COST_GROWTH ** safeOwned)
	);
};

export const producerBulkCost = (
	producerId: ProducerId,
	owned: number,
	quantity: number
): number => {
	const safeQuantity = Math.max(0, Math.floor(quantity));
	let total = 0;
	for (let index = 0; index < safeQuantity; index += 1) {
		total += producerCost(producerId, owned + index);
	}
	return clampGameValue(total);
};

// Smart Stocker picks the affordable producer with the best marginal
// production gain per can (including synergy gains), not the cheapest one.
export const bestStockerPurchase = (
	progress: GameProgress,
	cans: number
): ProducerId | null => {
	const baseCps = calculateProductionCps(progress);
	let bestId: ProducerId | null = null;
	let bestValue = 0;

	for (const producer of PRODUCERS) {
		const cost = producerCost(producer.id, progress.producers[producer.id]);
		if (cost > cans) {
			continue;
		}
		const candidate: GameProgress = {
			...progress,
			producers: {
				...progress.producers,
				[producer.id]: progress.producers[producer.id] + 1,
			},
		};
		const value = (calculateProductionCps(candidate) - baseCps) / cost;
		if (value > bestValue) {
			bestValue = value;
			bestId = producer.id;
		}
	}

	return bestId;
};

export const goldenUpgradeCost = (
	upgradeId: GoldenUpgradeId,
	rank: number
): number => {
	const upgrade = getGoldenUpgrade(upgradeId);
	if (!upgrade) {
		return MAX_GAME_VALUE;
	}
	if ("costGrowth" in upgrade) {
		return Math.round(upgrade.baseCost * upgrade.costGrowth ** rank);
	}
	return upgrade.baseCost * (rank + 1);
};

export const isAscensionNodeId = (value: string): value is AscensionNodeId =>
	ascensionNodeIds.has(value);

export const getAscensionNode = (id: AscensionNodeId) =>
	ascensionNodeById.get(id);

export const ascensionNodeCost = (
	nodeId: AscensionNodeId,
	rank: number
): number => {
	const node = getAscensionNode(nodeId);
	if (!node) {
		return MAX_GAME_VALUE;
	}
	if ("costGrowth" in node) {
		return Math.round(node.baseCost * node.costGrowth ** Math.max(0, rank));
	}
	return node.baseCost * (Math.max(0, rank) + 1);
};

export const ascensionNodeUnlocked = (
	nodes: AscensionNodeRanks,
	node: AscensionNode
): boolean => {
	if (!("requiredNode" in node && isAscensionNodeId(node.requiredNode))) {
		return true;
	}
	const requiredRank = "requiredRank" in node ? (node.requiredRank ?? 1) : 1;
	return (nodes[node.requiredNode] ?? 0) >= requiredRank;
};

export const ascensionPotential = (totalGoldenCans: number): number =>
	clampGameCounter(
		Math.sqrt(clampGameValue(totalGoldenCans)) / ASCENSION_SPARK_DIVISOR
	);

export const ascensionReward = (
	totalGoldenCans: number,
	totalAscensionSparks: number
): number =>
	clampGameCounter(
		ascensionPotential(totalGoldenCans) -
			Math.max(0, Math.floor(totalAscensionSparks))
	);

export const createStartingRunUpgrades = (
	nodes: AscensionNodeRanks
): string[] =>
	startingRunUpgradeIds.slice(0, Math.max(0, nodes["second-nature"] ?? 0));

export const goldenUpgradeUnlockLevel = (
	upgrade: { unlockLevel: number },
	nodes: AscensionNodeRanks
): number =>
	Math.max(1, upgrade.unlockLevel - Math.max(0, nodes["master-key"] ?? 0));

export const activeFrenzyMultiplier = (
	progress: GameProgress,
	frenzyStacks: number
): number =>
	frenzyMultiplier(progress) * (frenzyStacks > 1 ? FRENZY_STACK_BONUS : 1);

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

const overchargeMultiplier = (progress: GameProgress): number =>
	OVERCHARGE_MULTIPLIER **
	Math.max(0, progress.goldenUpgrades["overcharge-core"]);

export interface AchievementDefinition {
	description: string;
	id: string;
	isUnlocked: (progress: AchievementProgress) => boolean;
	name: string;
}

const totalProducersOwned = (progress: GameProgress): number => {
	let total = 0;
	for (const producer of PRODUCERS) {
		total += progress.producers[producer.id];
	}
	return total;
};

const LIFETIME_ACHIEVEMENT_TIERS = [
	{ name: "First Million", threshold: 1e6 },
	{ name: "Billionaire Buzz", threshold: 1e9 },
	{ name: "Trillion Taurine", threshold: 1e12 },
	{ name: "Quadrillion Quench", threshold: 1e15 },
	{ name: "Quintillion Chug", threshold: 1e18 },
	{ name: "Sextillion Surge", threshold: 1e21 },
	{ name: "Septillion Slam", threshold: 1e24 },
	{ name: "Octillion Overdrive", threshold: 1e27 },
	{ name: "Nonillion Nightcap", threshold: 1e30 },
	{ name: "Undecillion Uproar", threshold: 1e36 },
	{ name: "Tredecillion Tsunami", threshold: 1e42 },
	{ name: "Heat Death Hydration", threshold: 1e50 },
	{ name: "Novemdecillion Nirvana", threshold: 1e60 },
	{ name: "Googol Guzzler", threshold: 1e100 },
] as const;

const PRODUCER_COUNT_ACHIEVEMENT_TIERS = [
	{ name: "Stocked Up", threshold: 10 },
	{ name: "Supply Chain", threshold: 50 },
	{ name: "Distribution Empire", threshold: 100 },
	{ name: "Monster Monopoly", threshold: 250 },
	{ name: "Beverage Baron", threshold: 500 },
	{ name: "Can Cartel", threshold: 1000 },
	{ name: "Galactic Grocer", threshold: 2500 },
	{ name: "Planetary Distribution", threshold: 5000 },
	{ name: "Ten Thousand Tabs", threshold: 10_000 },
] as const;

const PRESTIGE_ACHIEVEMENT_TIERS = [
	{ name: "Born Again", threshold: 1 },
	{ name: "Serial Resetter", threshold: 3 },
	{ name: "Prestige Pro", threshold: 5 },
	{ name: "Golden Age", threshold: 8 },
	{ name: "Double Digits", threshold: 10 },
	{ name: "Ascension Addict", threshold: 15 },
	{ name: "Beyond the Beast", threshold: 20 },
	{ name: "Silver Ascendant", threshold: 25 },
	{ name: "Ascension Architect", threshold: 30 },
	{ name: "Beast Reborn", threshold: 40 },
	{ name: "Half-Century Saint", threshold: 50 },
	{ name: "Centurion of Cans", threshold: 100 },
] as const;

const GOLDEN_CAN_ACHIEVEMENT_TIERS = [
	{ name: "Golden Pocket", threshold: 10 },
	{ name: "Golden Vault", threshold: 1000 },
	{ name: "Golden Hoard", threshold: 100_000 },
	{ name: "Golden Singularity", threshold: 1_000_000 },
	{ name: "Golden Galaxy", threshold: 1e8 },
	{ name: "Golden Dimension", threshold: 1e9 },
	{ name: "Golden Overflow", threshold: 2e9 },
] as const;

const RUN_UPGRADE_ACHIEVEMENT_TIERS = [
	{ name: "Collector", threshold: 10 },
	{ name: "Connoisseur", threshold: 25 },
	{ name: "Completionist", threshold: 50 },
	{ name: "Kitchen Sink", threshold: 100 },
	{ name: "Shelf Emptier", threshold: 150 },
	{ name: "Nothing Left to Buy", threshold: RUN_UPGRADES.length },
] as const;

const CENTURY_ACHIEVEMENT_THRESHOLD = 100;
const ENDGAME_PRODUCER_THRESHOLD = MILESTONES.at(-1) ?? 300;
const GOLDEN_HOARD_THRESHOLD = 100_000;
const PERFECT_RUN_THRESHOLD = 1e24;
const finalProducer = PRODUCERS.at(-1) ?? PRODUCERS[0];

const isGoldenUpgradeMaxed = (
	progress: AchievementProgress,
	id: GoldenUpgradeId
): boolean =>
	progress.goldenUpgrades[id] >= (goldenUpgradeById.get(id)?.maxRank ?? 1);

const ENDGAME_ACHIEVEMENTS: AchievementDefinition[] = [
	{
		description: `Own ${ENDGAME_PRODUCER_THRESHOLD}× ${finalProducer.name}`,
		id: "beast-legion",
		isUnlocked: (progress) =>
			progress.producers[finalProducer.id] >= ENDGAME_PRODUCER_THRESHOLD,
		name: "Beast Legion",
	},
	{
		description: `Own ${ENDGAME_PRODUCER_THRESHOLD}× of every producer at once`,
		id: "maxed-lineup",
		isUnlocked: (progress) =>
			PRODUCERS.every(
				({ id }) => progress.producers[id] >= ENDGAME_PRODUCER_THRESHOLD
			),
		name: "Maxed Lineup",
	},
	{
		description: "Max out Overcharge Core",
		id: "overcharge-max",
		isUnlocked: (progress) => isGoldenUpgradeMaxed(progress, "overcharge-core"),
		name: "Overcharged",
	},
	{
		description: "Max out Frenzy Core",
		id: "frenzy-core-max",
		isUnlocked: (progress) => isGoldenUpgradeMaxed(progress, "frenzy-core"),
		name: "Frenzy Incarnate",
	},
	{
		description: "Max out every golden upgrade",
		id: "golden-perfection",
		isUnlocked: (progress) =>
			GOLDEN_UPGRADES.every(({ id }) => isGoldenUpgradeMaxed(progress, id)),
		name: "Golden Perfection",
	},
	{
		description: `Hold ${formatGameNumber(GOLDEN_HOARD_THRESHOLD)} unspent golden cans`,
		id: "golden-dragon",
		isUnlocked: (progress) =>
			(progress.goldenCans ?? 0) >= GOLDEN_HOARD_THRESHOLD,
		name: "Golden Dragon",
	},
	{
		description: `Earn ${formatGameNumber(PERFECT_RUN_THRESHOLD)} cans in a single run`,
		id: "perfect-run",
		isUnlocked: (progress) =>
			(progress.bestRunCans ?? 0) >= PERFECT_RUN_THRESHOLD,
		name: "One Perfect Run",
	},
];

const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	...LIFETIME_ACHIEVEMENT_TIERS.map(({ name, threshold }) => ({
		description: `Earn ${formatGameNumber(threshold)} lifetime cans`,
		id: `lifetime-${threshold.toExponential(0)}`,
		isUnlocked: (progress: AchievementProgress) =>
			(progress.lifetimeCans ?? 0) >= threshold,
		name,
	})),
	...PRODUCER_COUNT_ACHIEVEMENT_TIERS.map(({ name, threshold }) => ({
		description: `Own ${threshold} producers in one run`,
		id: `producers-${threshold}`,
		isUnlocked: (progress: AchievementProgress) =>
			totalProducersOwned(progress) >= threshold,
		name,
	})),
	...PRODUCERS.map((producer) => ({
		description: `Own ${CENTURY_ACHIEVEMENT_THRESHOLD}× ${producer.name}`,
		id: `${producer.id}-century`,
		isUnlocked: (progress: AchievementProgress) =>
			progress.producers[producer.id] >= CENTURY_ACHIEVEMENT_THRESHOLD,
		name: `Century: ${producer.name}`,
	})),
	...PRESTIGE_ACHIEVEMENT_TIERS.map(({ name, threshold }) => ({
		description: `Reach prestige level ${threshold}`,
		id: `prestige-${threshold}`,
		isUnlocked: (progress: AchievementProgress) =>
			(progress.prestigeLevel ?? 0) >= threshold,
		name,
	})),
	...GOLDEN_CAN_ACHIEVEMENT_TIERS.map(({ name, threshold }) => ({
		description: `Collect ${formatGameNumber(threshold)} total golden cans`,
		id: `golden-${threshold}`,
		isUnlocked: (progress: AchievementProgress) =>
			progress.totalGoldenCans >= threshold,
		name,
	})),
	...RUN_UPGRADE_ACHIEVEMENT_TIERS.map(({ name, threshold }) => ({
		description: `Own ${threshold} run upgrades at once`,
		id: `upgrades-${threshold}`,
		isUnlocked: (progress: AchievementProgress) =>
			progress.runUpgrades.length >= threshold,
		name,
	})),
	...ENDGAME_ACHIEVEMENTS,
];

// ponytail: unlocks are permanent, so a prestige reset never takes the bonus back
export const ACHIEVEMENTS: AchievementDefinition[] =
	ACHIEVEMENT_DEFINITIONS.map((achievement) => ({
		...achievement,
		isUnlocked: (progress: AchievementProgress) =>
			progress.unlockedAchievements?.includes(achievement.id) === true ||
			achievement.isUnlocked(progress),
	}));

const achievementIds = new Set(ACHIEVEMENTS.map(({ id }) => id));

export const isAchievementId = (value: unknown): value is string =>
	typeof value === "string" && achievementIds.has(value);

export const unlockedAchievementIds = (
	progress: AchievementProgress
): string[] =>
	ACHIEVEMENTS.filter((achievement) => achievement.isUnlocked(progress)).map(
		({ id }) => id
	);

export const countUnlockedAchievements = (
	progress: AchievementProgress
): number => {
	let count = 0;
	for (const achievement of ACHIEVEMENTS) {
		if (achievement.isUnlocked(progress)) {
			count += 1;
		}
	}
	return count;
};

const achievementMultiplier = (progress: AchievementProgress): number =>
	1 + countUnlockedAchievements(progress) * ACHIEVEMENT_PRODUCTION_BONUS;

export const calculateProductionCps = (
	progress: AchievementProgress
): number => {
	const synergyMultiplier = createInitialProducers();
	for (const producer of PRODUCERS) {
		synergyMultiplier[producer.id] = 1;
	}
	for (const producer of PRODUCERS) {
		const target = PRODUCER_SYNERGIES[producer.id];
		synergyMultiplier[target] +=
			progress.producers[producer.id] * SYNERGY_BONUS_PER_OWNED;
	}
	let producerCps = 0;
	for (const producer of PRODUCERS) {
		producerCps +=
			producer.baseCps *
			progress.producers[producer.id] *
			producerMultiplier(progress, producer.id) *
			synergyMultiplier[producer.id];
	}
	producerCps *= 2 ** countRunUpgradesOfKind(progress, "flavor");
	producerCps *= 1 + progress.goldenUpgrades["endless-chill"] * 0.15;
	producerCps *=
		1 + Math.max(0, progress.totalGoldenCans) * GOLDEN_CAN_PRODUCTION_BONUS;
	producerCps *= achievementMultiplier(progress);
	producerCps *= overchargeMultiplier(progress);
	producerCps *= collectionMultiplier(progress.collection);
	return clampGameValue(producerCps * reactorMultiplier(progress));
};

export const calculateClickValue = (progress: AchievementProgress): number => {
	const clickBase =
		CLICK_UPGRADE_MULTIPLIER ** countRunUpgradesOfKind(progress, "click");
	const cpsPercent =
		countRunUpgradesOfKind(progress, "cps-click") * CPS_CLICK_PERCENT;
	const gripMultiplier = 1 + progress.goldenUpgrades["golden-grip"] * 0.25;
	return clampGameValue(
		(clickBase + calculateProductionCps(progress) * cpsPercent) * gripMultiplier
	);
};

export const calculateCps = (progress: AchievementProgress): number => {
	const autoClickCps =
		progress.goldenUpgrades["auto-tapper"] * calculateClickValue(progress);
	return clampGameValue(calculateProductionCps(progress) + autoClickCps);
};

export const frenzyMultiplier = (progress: GameProgress): number =>
	FRENZY_MULTIPLIER +
	Math.max(0, progress.goldenUpgrades["frenzy-core"]) * FRENZY_CORE_BONUS;

export const frenzyDurationMs = (progress: GameProgress): number =>
	FRENZY_DURATION_MS +
	Math.max(0, progress.goldenUpgrades["frenzy-chronometer"]) *
		FRENZY_CHRONOMETER_BONUS_MS;

export const offlineProductionMultiplier = (progress: GameProgress): number =>
	OFFLINE_PRODUCTION_MULTIPLIER *
	2 ** Math.max(0, progress.goldenUpgrades["time-capsule"]);

export const productionBuffMultiplier = (
	buff: GoldenRushBuffState,
	now: number
): number =>
	buff.goldenRushBuffKind === "production_frenzy" &&
	(buff.goldenRushBuffEndsAt ?? 0) > now
		? PRODUCTION_FRENZY_MULTIPLIER
		: 1;

export const clickBuffMultiplier = (
	buff: GoldenRushBuffState,
	now: number
): number =>
	buff.goldenRushBuffKind === "click_rush" &&
	(buff.goldenRushBuffEndsAt ?? 0) > now
		? CLICK_RUSH_MULTIPLIER
		: 1;

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

export const productionTimeMs = (
	progress: GameProgress,
	elapsedMs: number,
	frenzyMs: number,
	buffMs = 0,
	buffMultiplier = 1,
	frenzyBoost = 1
): number => {
	const safeElapsedMs = Math.max(0, elapsedMs);
	const safeFrenzyMs = Math.min(safeElapsedMs, Math.max(0, frenzyMs));
	const safeBuffMs = Math.min(safeElapsedMs, Math.max(0, buffMs));
	const overlapMs = Math.min(safeFrenzyMs, safeBuffMs);
	const frenzyBonus = frenzyMultiplier(progress) * frenzyBoost - 1;
	const buffBonus = Math.max(0, buffMultiplier - 1);
	return (
		safeElapsedMs +
		safeFrenzyMs * frenzyBonus +
		safeBuffMs * buffBonus +
		overlapMs * frenzyBonus * buffBonus
	);
};

export const calculateIdleGain = (
	progress: AchievementProgress,
	elapsedMs: number,
	frenzyMs: number,
	productionMultiplier: number,
	buffMs = 0,
	buffMultiplier = 1,
	frenzyBoost = 1
): number =>
	clampGameValue(
		calculateCps(progress) *
			(productionTimeMs(
				progress,
				elapsedMs,
				frenzyMs,
				buffMs,
				buffMultiplier,
				frenzyBoost
			) /
				1000) *
			Math.max(0, productionMultiplier)
	);

export const goldenCanPotential = (lifetimeCans: number): number =>
	clampGameCounter(Math.sqrt(clampGameValue(lifetimeCans) / GOLDEN_CAN_BASE));

export const prestigeReward = (
	lifetimeCans: number,
	totalGoldenCans: number
): number =>
	clampGameCounter(
		goldenCanPotential(lifetimeCans) - Math.max(0, Math.floor(totalGoldenCans))
	);

export const nextGoldenCanRequirement = (totalGoldenCans: number): number =>
	clampGameValue(
		GOLDEN_CAN_BASE * (Math.max(0, Math.floor(totalGoldenCans)) + 1) ** 2
	);

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

export const rollGoldenRushDelayMs = (randomValue: number): number => {
	const safeRandom = Math.min(1, Math.max(0, randomValue));
	return Math.round(
		GOLDEN_RUSH_MIN_DELAY_MS +
			safeRandom * (GOLDEN_RUSH_MAX_DELAY_MS - GOLDEN_RUSH_MIN_DELAY_MS)
	);
};

export const luckyCanGain = (
	progress: AchievementProgress,
	cans: number
): number =>
	clampGameValue(
		Math.max(
			LUCKY_CAN_MIN_CLICKS * calculateClickValue(progress),
			Math.min(
				LUCKY_CAN_CPS_SECONDS * calculateCps(progress),
				LUCKY_CAN_BANK_PERCENT * Math.max(0, cans)
			)
		)
	);

const LUCKY_REWARD_CHANCE = 0.45;
const CLICK_RUSH_REWARD_CHANCE = 0.1;

export const rollGoldenRushReward = (
	progress: AchievementProgress,
	cans: number,
	randomValue: number
): GoldenRushReward => {
	const safeRandom = Math.min(1, Math.max(0, randomValue));
	if (safeRandom < LUCKY_REWARD_CHANCE) {
		return { cans: luckyCanGain(progress, cans), kind: "lucky" };
	}
	if (safeRandom < LUCKY_REWARD_CHANCE + CLICK_RUSH_REWARD_CHANCE) {
		return {
			durationMs: CLICK_RUSH_DURATION_MS,
			kind: "click_rush",
			multiplier: CLICK_RUSH_MULTIPLIER,
		};
	}
	return {
		durationMs: PRODUCTION_FRENZY_DURATION_MS,
		kind: "production_frenzy",
		multiplier: PRODUCTION_FRENZY_MULTIPLIER,
	};
};
