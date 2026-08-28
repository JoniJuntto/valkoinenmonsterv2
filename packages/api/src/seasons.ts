import {
	acceptManualClicks,
	clampGameValue,
	PRODUCER_COST_GROWTH,
} from "./game";

export const SEASON_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const SEASON_ANCHOR_MS = Date.UTC(2026, 0, 5);

export interface SeasonProducerDefinition {
	baseCost: number;
	baseCps: number;
	id: string;
	name: string;
}

export type SeasonUpgradeKind = "click" | "flavor";

export interface SeasonUpgradeDefinition {
	cost: number;
	description: string;
	id: string;
	kind: SeasonUpgradeKind;
	name: string;
}

export interface SeasonTheme {
	id: string;
	name: string;
	producers: SeasonProducerDefinition[];
	tagline: string;
	upgrades: SeasonUpgradeDefinition[];
}

const SEASON_PRODUCER_BALANCE = [
	{ baseCost: 15, baseCps: 0.5 },
	{ baseCost: 250, baseCps: 4 },
	{ baseCost: 4000, baseCps: 30 },
	{ baseCost: 75_000, baseCps: 220 },
] as const;

const SEASON_CLICK_UPGRADE_COSTS = [
	200, 20_000, 2_000_000, 200_000_000,
] as const;
const SEASON_FLAVOR_UPGRADE_COSTS = [
	5000, 500_000, 50_000_000, 5_000_000_000,
] as const;

const buildTheme = (
	id: string,
	name: string,
	tagline: string,
	producerNames: readonly [string, string, string, string],
	clickNames: readonly [string, string, string, string],
	flavorNames: readonly [string, string, string, string]
): SeasonTheme => {
	const producers = SEASON_PRODUCER_BALANCE.map((balance, index) => ({
		...balance,
		id: `${id}-${index + 1}`,
		name: producerNames[index] ?? id,
	}));
	const upgrades: SeasonUpgradeDefinition[] = [
		...SEASON_CLICK_UPGRADE_COSTS.map((cost, index) => ({
			cost,
			description: "2× cans per season tap",
			id: `${id}-click-${index + 1}`,
			kind: "click" as const,
			name: clickNames[index] ?? id,
		})),
		...SEASON_FLAVOR_UPGRADE_COSTS.map((cost, index) => ({
			cost,
			description: "2× all season production",
			id: `${id}-flavor-${index + 1}`,
			kind: "flavor" as const,
			name: flavorNames[index] ?? id,
		})),
	];
	return { id, name, producers, tagline, upgrades };
};

export const SEASON_THEMES: SeasonTheme[] = [
	buildTheme(
		"frostbite",
		"Frostbite Wave",
		"Chill the world, one can at a time.",
		[
			"Ice Shard Sipper",
			"Glacier Chiller",
			"Blizzard Brewery",
			"Polar Fusion Reactor",
		],
		["Rime Grip", "Frost Punch", "Avalanche Palm", "Zero-Kelvin Touch"],
		["Permafrost Chill", "Glacial Flow", "Polar Surge", "Absolute Zero Brew"]
	),
	buildTheme(
		"neon-jungle",
		"Neon Jungle",
		"The vines are glowing. Drink up.",
		[
			"Firefly Tab Puller",
			"Liana Vending Vine",
			"Canopy Corner Club",
			"Night Bloom Infuser",
		],
		["Jungle Grip", "Vine Snap", "Canopy Crush", "Predator Palm"],
		[
			"Bioluminescent Brew",
			"Chlorophyll Rush",
			"Wild Growth",
			"Bloom Overdrive",
		]
	),
	buildTheme(
		"solar-flare",
		"Solar Flare",
		"Drink like the sun is watching.",
		[
			"Sunspot Sipper",
			"Corona Cooler",
			"Helios Filling Rig",
			"Solar Max Reactor",
		],
		["Ember Grip", "Flare Punch", "Magma Palm", "Photosphere Touch"],
		["Dawn Distillation", "Corona Cascade", "Fusion Brew", "Supernova Batch"]
	),
];

export interface SeasonInfo {
	endsAt: number;
	id: string;
	index: number;
	name: string;
	startsAt: number;
	tagline: string;
	themeId: string;
}

export const resolveSeason = (nowMs: number): SeasonInfo => {
	const index = Math.max(
		0,
		Math.floor((nowMs - SEASON_ANCHOR_MS) / SEASON_DURATION_MS)
	);
	const theme = SEASON_THEMES[index % SEASON_THEMES.length] ?? SEASON_THEMES[0];
	if (!theme) {
		throw new Error("SEASON_THEMES must not be empty");
	}
	const startsAt = SEASON_ANCHOR_MS + index * SEASON_DURATION_MS;
	return {
		endsAt: startsAt + SEASON_DURATION_MS,
		id: `s${index}`,
		index,
		name: theme.name,
		startsAt,
		tagline: theme.tagline,
		themeId: theme.id,
	};
};

export const getSeasonTheme = (themeId: string): SeasonTheme => {
	const theme = SEASON_THEMES.find(({ id }) => id === themeId);
	if (theme) {
		return theme;
	}
	// ponytail: unknown theme ids fall back to theme 0; only happens if SEASON_THEMES is edited mid-flight
	const fallback = SEASON_THEMES[0];
	if (!fallback) {
		throw new Error("SEASON_THEMES must not be empty");
	}
	return fallback;
};

export const getSeasonProducer = (
	themeId: string,
	producerId: string
): SeasonProducerDefinition | undefined =>
	getSeasonTheme(themeId).producers.find(({ id }) => id === producerId);

export const getSeasonUpgrade = (
	themeId: string,
	upgradeId: string
): SeasonUpgradeDefinition | undefined =>
	getSeasonTheme(themeId).upgrades.find(({ id }) => id === upgradeId);

export const createSeasonProducers = (
	themeId: string
): Record<string, number> => {
	const producers: Record<string, number> = {};
	for (const producer of getSeasonTheme(themeId).producers) {
		producers[producer.id] = 0;
	}
	return producers;
};

export const seasonProducerCost = (
	producer: SeasonProducerDefinition,
	owned: number
): number =>
	clampGameValue(
		Math.floor(
			producer.baseCost * PRODUCER_COST_GROWTH ** Math.max(0, Math.floor(owned))
		)
	);

export const seasonProducerBulkCost = (
	producer: SeasonProducerDefinition,
	owned: number,
	quantity: number
): number => {
	let total = 0;
	for (let index = 0; index < Math.max(0, Math.floor(quantity)); index += 1) {
		total += seasonProducerCost(producer, owned + index);
	}
	return clampGameValue(total);
};

const countSeasonUpgradesOfKind = (
	upgrades: string[],
	themeId: string,
	kind: SeasonUpgradeKind
): number => {
	let count = 0;
	for (const id of upgrades) {
		if (getSeasonUpgrade(themeId, id)?.kind === kind) {
			count += 1;
		}
	}
	return count;
};

export const calculateSeasonCps = (
	themeId: string,
	producers: Record<string, number>,
	upgrades: string[]
): number => {
	let cps = 0;
	for (const producer of getSeasonTheme(themeId).producers) {
		cps += producer.baseCps * Math.max(0, producers[producer.id] ?? 0);
	}
	// Fixed ruleset: no golden upgrades, no achievements, no prestige bonuses —
	// the only multipliers are the season's own flavor upgrades, so every
	// player competes on an identical ladder.
	cps *= 2 ** countSeasonUpgradesOfKind(upgrades, themeId, "flavor");
	return clampGameValue(cps);
};

export const calculateSeasonClickValue = (
	themeId: string,
	upgrades: string[]
): number => 2 ** countSeasonUpgradesOfKind(upgrades, themeId, "click");

export interface SeasonStateCore {
	cans: number;
	lastAccruedAt: Date;
	manualClickBudget: number;
	producers: Record<string, number>;
	score: number;
	upgrades: string[];
}

export const accrueSeasonState = <T extends SeasonStateCore>(
	themeId: string,
	state: T,
	pendingManualClicks: number,
	now: Date
): { acceptedClicks: number; state: T } => {
	const elapsedMs = Math.max(0, now.getTime() - state.lastAccruedAt.getTime());
	const { acceptedClicks, remainingBudget } = acceptManualClicks(
		state.manualClickBudget,
		elapsedMs,
		pendingManualClicks
	);
	const gain =
		(calculateSeasonCps(themeId, state.producers, state.upgrades) * elapsedMs) /
			1000 +
		acceptedClicks * calculateSeasonClickValue(themeId, state.upgrades);
	const safeGain = clampGameValue(gain);
	return {
		acceptedClicks,
		state: {
			...state,
			cans: clampGameValue(state.cans + safeGain),
			lastAccruedAt: now,
			manualClickBudget: remainingBudget,
			score: clampGameValue(state.score + safeGain),
		},
	};
};
