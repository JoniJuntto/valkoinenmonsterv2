import { describe, expect, test } from "bun:test";

import {
	accrueSeasonState,
	calculateSeasonClickValue,
	calculateSeasonCps,
	createSeasonProducers,
	getSeasonProducer,
	getSeasonTheme,
	getSeasonUpgrade,
	resolveSeason,
	SEASON_ANCHOR_MS,
	SEASON_DURATION_MS,
	SEASON_THEMES,
	seasonProducerBulkCost,
	seasonProducerCost,
} from "./seasons";

describe("season schedule", () => {
	test("starts season 0 at the anchor and rotates every two weeks", () => {
		const seasonZero = resolveSeason(SEASON_ANCHOR_MS);
		expect(seasonZero.id).toBe("s0");
		expect(seasonZero.startsAt).toBe(SEASON_ANCHOR_MS);
		expect(seasonZero.endsAt).toBe(SEASON_ANCHOR_MS + SEASON_DURATION_MS);

		const lateFirstSeason = resolveSeason(
			SEASON_ANCHOR_MS + SEASON_DURATION_MS - 1
		);
		expect(lateFirstSeason.id).toBe("s0");

		const secondSeason = resolveSeason(SEASON_ANCHOR_MS + SEASON_DURATION_MS);
		expect(secondSeason.id).toBe("s1");
	});

	test("cycles themes in order and repeats", () => {
		for (let offset = 0; offset < SEASON_THEMES.length * 2; offset += 1) {
			const season = resolveSeason(
				SEASON_ANCHOR_MS + offset * SEASON_DURATION_MS
			);
			const expected = SEASON_THEMES[offset % SEASON_THEMES.length];
			expect(season.themeId).toBe(expected?.id);
			expect(season.name).toBe(expected?.name);
		}
	});

	test("clamps timestamps before the anchor to season 0", () => {
		expect(resolveSeason(0).id).toBe("s0");
	});
});

describe("fixed season ruleset", () => {
	test("fresh progress produces nothing and clicks are worth one can", () => {
		const theme = getSeasonTheme(SEASON_THEMES[0]?.id ?? "");
		const producers = createSeasonProducers(theme.id);
		for (const producer of theme.producers) {
			expect(producers[producer.id]).toBe(0);
		}
		expect(calculateSeasonCps(theme.id, producers, [])).toBe(0);
		expect(calculateSeasonClickValue(theme.id, [])).toBe(1);
	});

	test("season production only uses season upgrades, never golden bonuses", () => {
		const theme = getSeasonTheme(SEASON_THEMES[0]?.id ?? "");
		const firstProducer = theme.producers[0];
		if (!firstProducer) {
			throw new Error("theme must define producers");
		}
		const producers = { ...createSeasonProducers(theme.id) };
		producers[firstProducer.id] = 2;
		expect(calculateSeasonCps(theme.id, producers, [])).toBe(
			firstProducer.baseCps * 2
		);

		const flavor = theme.upgrades.find(({ kind }) => kind === "flavor");
		if (!flavor) {
			throw new Error("theme must define flavor upgrades");
		}
		expect(
			calculateSeasonCps(theme.id, producers, [flavor.id, "not-a-real-upgrade"])
		).toBe(firstProducer.baseCps * 2 * 2);

		const click = theme.upgrades.find(({ kind }) => kind === "click");
		if (!click) {
			throw new Error("theme must define click upgrades");
		}
		expect(calculateSeasonClickValue(theme.id, [click.id])).toBe(2);
		expect(calculateSeasonClickValue(theme.id, [click.id, "bogus"])).toBe(2);
	});

	test("unknown theme ids fall back to the first theme", () => {
		expect(getSeasonTheme("nope").id).toBe(SEASON_THEMES[0]?.id);
	});
});

describe("season accrual", () => {
	const buildState = (
		themeId: string,
		overrides: Partial<Parameters<typeof accrueSeasonState>[1]> = {}
	) => ({
		cans: 0,
		lastAccruedAt: new Date(0),
		manualClickBudget: 20,
		producers: createSeasonProducers(themeId),
		score: 0,
		upgrades: [],
		...overrides,
	});

	test("accrues production and clicks into cans and score equally", () => {
		const theme = getSeasonTheme(SEASON_THEMES[0]?.id ?? "");
		const firstProducer = theme.producers[0];
		if (!firstProducer) {
			throw new Error("theme must define producers");
		}
		const state = buildState(theme.id);
		state.producers[firstProducer.id] = 4;
		const { acceptedClicks, state: next } = accrueSeasonState(
			theme.id,
			state,
			5,
			new Date(2000)
		);
		const expectedCans = firstProducer.baseCps * 4 * 2 + 5;
		expect(acceptedClicks).toBe(5);
		expect(next.cans).toBeCloseTo(expectedCans);
		expect(next.score).toBeCloseTo(expectedCans);
	});

	test("click budget throttles taps like the main game", () => {
		const theme = getSeasonTheme(SEASON_THEMES[0]?.id ?? "");
		const { acceptedClicks, state: next } = accrueSeasonState(
			theme.id,
			buildState(theme.id),
			500,
			new Date(1000)
		);
		expect(acceptedClicks).toBe(40);
		expect(next.manualClickBudget).toBe(0);
		expect(next.cans).toBe(40);
	});
});

describe("season shop", () => {
	test("prices follow the shared growth curve", () => {
		const theme = getSeasonTheme(SEASON_THEMES[0]?.id ?? "");
		const firstProducer = theme.producers[0];
		if (!firstProducer) {
			throw new Error("theme must define producers");
		}
		expect(seasonProducerCost(firstProducer, 0)).toBe(firstProducer.baseCost);
		expect(seasonProducerCost(firstProducer, 3)).toBe(
			Math.floor(firstProducer.baseCost * 1.15 ** 3)
		);
		expect(seasonProducerBulkCost(firstProducer, 0, 2)).toBe(
			seasonProducerCost(firstProducer, 0) +
				seasonProducerCost(firstProducer, 1)
		);
		expect(getSeasonProducer(theme.id, firstProducer.id)).toBeDefined();
		expect(getSeasonProducer(theme.id, "missing")).toBeUndefined();
		expect(
			getSeasonUpgrade(theme.id, theme.upgrades[0]?.id ?? "")
		).toBeDefined();
		expect(getSeasonUpgrade(theme.id, "missing")).toBeUndefined();
	});
});
