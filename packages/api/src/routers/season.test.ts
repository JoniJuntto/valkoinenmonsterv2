import { describe, expect, test } from "bun:test";

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3001";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";

const { buySeasonProducer, buySeasonUpgrade } = await import("./season");
const { createSeasonProducers, getSeasonTheme, SEASON_THEMES } = await import(
	"../seasons"
);

const theme = getSeasonTheme(SEASON_THEMES[0]?.id ?? "");
const now = new Date(0);

const seasonRow = (overrides: Record<string, unknown> = {}) => ({
	cans: 0,
	createdAt: now,
	id: 1,
	lastAccruedAt: now,
	lastOperationId: null,
	manualClickBudget: 20,
	producers: createSeasonProducers(theme.id),
	revision: 0,
	score: 0,
	seasonId: "s0",
	updatedAt: now,
	upgrades: [],
	userId: "user",
	...overrides,
});

describe("season shop mutations", () => {
	test("rejects unknown producer and upgrade ids", () => {
		expect(() => buySeasonProducer(theme.id, "missing")).toThrow(
			"Unknown producer"
		);
		expect(() => buySeasonUpgrade(theme.id, "missing")).toThrow(
			"Unknown upgrade"
		);
	});

	test("buys a producer and pays the exact cost", () => {
		const firstProducer = theme.producers[0];
		if (!firstProducer) {
			throw new Error("theme must define producers");
		}
		const state = seasonRow({ cans: firstProducer.baseCost });
		const purchased = buySeasonProducer(theme.id, firstProducer.id)(state, now);
		expect(purchased.cans).toBe(0);
		expect(purchased.producers[firstProducer.id]).toBe(1);
		expect(() =>
			buySeasonProducer(theme.id, firstProducer.id)(
				seasonRow({ cans: firstProducer.baseCost - 1 }),
				now
			)
		).toThrow("Not enough season cans");
	});

	test("buys each upgrade once and locks duplicates", () => {
		const click = theme.upgrades.find(({ kind }) => kind === "click");
		if (!click) {
			throw new Error("theme must define click upgrades");
		}
		const state = seasonRow({ cans: click.cost });
		const upgraded = buySeasonUpgrade(theme.id, click.id)(state, now);
		expect(upgraded.upgrades).toEqual([click.id]);
		expect(upgraded.cans).toBe(0);
		expect(() => buySeasonUpgrade(theme.id, click.id)(upgraded, now)).toThrow(
			"Upgrade is locked"
		);
	});
});
