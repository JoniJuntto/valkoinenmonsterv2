import { afterAll, describe, expect, test } from "bun:test";
import { seasonState } from "@valkoinenmonsterv2/db/schema/game";
import { and, eq } from "drizzle-orm";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
	throw new Error("TEST_DATABASE_URL is required for integration tests");
}

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3001";
process.env.DATABASE_URL = testDatabaseUrl;

const { connectTestDatabase, deleteTestUsers, seedTestUser } = await import(
	"@valkoinenmonsterv2/db/test-database"
);
const { buySeasonProducer, runSeasonMutation } = await import("./season");
const {
	createSeasonProducers,
	getSeasonTheme,
	resolveSeason,
	seasonProducerBulkCost,
	SEASON_THEMES,
} = await import("../seasons");

const connection = connectTestDatabase();
const { database } = connection;

afterAll(async () => {
	await connection.close();
});

const season = resolveSeason(Date.now());
const theme = getSeasonTheme(season.themeId);

const seasonInput = (
	revision: number,
	pendingManualClicks = 0,
	operationId = crypto.randomUUID()
) => ({
	operationId,
	pendingManualClicks,
	revision,
});

const readSeasonSave = async (userId: string) => {
	const [save] = await database
		.select()
		.from(seasonState)
		.where(
			and(eq(seasonState.userId, userId), eq(seasonState.seasonId, season.id))
		)
		.limit(1);
	return save;
};

describe("PostgreSQL season mutation contract", () => {
	test("joins the season lazily and accrues taps into cans and score", async () => {
		const userId = await seedTestUser(database);
		try {
			const first = await runSeasonMutation(database, userId, season, {
				...seasonInput(-1),
				pendingManualClicks: 0,
			});
			const row = await readSeasonSave(userId);

			expect(first.replayed).toBe(false);
			expect(row?.seasonId).toBe(season.id);
			expect(row?.producers).toEqual(createSeasonProducers(theme.id));
			expect(row?.score).toBe(0);

			const tapped = await runSeasonMutation(
				database,
				userId,
				season,
				seasonInput(row?.revision ?? 0, 3)
			);
			expect(tapped.acceptedClicks).toBe(3);
			expect(tapped.snapshot.cans).toBe(3);
			expect(tapped.snapshot.score).toBe(3);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("replays an identical operation id without accruing twice", async () => {
		const userId = await seedTestUser(database);
		try {
			const input = seasonInput(0, 2, "00000000-0000-4000-8000-00000000aa01");
			await runSeasonMutation(database, userId, season, input);
			const before = await readSeasonSave(userId);

			const retried = await runSeasonMutation(database, userId, season, {
				...input,
				revision: 1,
			});
			expect(retried.replayed).toBe(true);
			expect(await readSeasonSave(userId)).toEqual(before);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("rejects stale revisions and buys producers atomically", async () => {
		const userId = await seedTestUser(database);
		try {
			const firstProducer = theme.producers[0];
			if (!firstProducer) {
				throw new Error("theme must define producers");
			}
			const seeded = await runSeasonMutation(database, userId, season, {
				...seasonInput(-1),
			});

			const rich = await database
				.update(seasonState)
				.set({ cans: firstProducer.baseCost * 10 })
				.where(
					and(
						eq(seasonState.userId, userId),
						eq(seasonState.seasonId, season.id)
					)
				)
				.returning();
			const revision = rich[0]?.revision ?? seeded.snapshot.revision;

			const purchased = await runSeasonMutation(
				database,
				userId,
				season,
				seasonInput(revision, 0),
				buySeasonProducer(theme.id, firstProducer.id, 2)
			);
			expect(purchased.snapshot.producers[firstProducer.id]).toBe(2);
			expect(purchased.snapshot.cans).toBe(
				firstProducer.baseCost * 10 -
					seasonProducerBulkCost(firstProducer, 0, 2)
			);

			await expect(
				runSeasonMutation(
					database,
					userId,
					season,
					seasonInput(revision, 0),
					buySeasonProducer(theme.id, firstProducer.id)
				)
			).rejects.toMatchObject({ code: "CONFLICT" });
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});
});
