import { afterAll, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { gameState } from "@valkoinenmonsterv2/db/schema/game";
import { eq } from "drizzle-orm";

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
const { createDefaultGameState, mutateGameStateWithState, prestige } =
	await import("./game");

const connection = connectTestDatabase();
const { database } = connection;

afterAll(async () => {
	await connection.close();
});

const mutationInput = (
	revision: number,
	operationId = crypto.randomUUID()
) => ({
	operationId,
	pendingManualClicks: 0,
	revision,
});

const readSave = async (userId: string) => {
	const [save] = await database
		.select()
		.from(gameState)
		.where(eq(gameState.userId, userId))
		.limit(1);
	return save;
};

describe("PostgreSQL game mutation contract", () => {
	test("creates a missing save and applies the first operation once", async () => {
		const userId = await seedTestUser(database);
		try {
			const input = {
				...mutationInput(0),
				pendingManualClicks: 1,
			};
			const result = await mutateGameStateWithState(
				database,
				userId,
				false,
				input
			);
			const save = await readSave(userId);

			expect(result.replayed).toBe(false);
			expect(result.acceptedClicks).toBe(1);
			expect(save?.revision).toBe(1);
			expect(save?.lastOperationId).toBe(input.operationId);
			expect(save?.cans).toBe(1);
			expect(save?.lifetimeCans).toBe(1);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("returns an immediate retry without accruing or writing twice", async () => {
		const userId = await seedTestUser(database);
		try {
			const input = mutationInput(0);
			const first = await mutateGameStateWithState(
				database,
				userId,
				false,
				input
			);
			const beforeRetry = await readSave(userId);
			const retried = await mutateGameStateWithState(
				database,
				userId,
				false,
				input
			);
			const afterRetry = await readSave(userId);

			expect(first.replayed).toBe(false);
			expect(retried.replayed).toBe(true);
			expect(retried.state.revision).toBe(1);
			expect(afterRetry).toEqual(beforeRetry);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("rejects a new stale operation without changing the row", async () => {
		const userId = await seedTestUser(database);
		try {
			await mutateGameStateWithState(database, userId, false, mutationInput(0));
			const beforeConflict = await readSave(userId);

			await expect(
				mutateGameStateWithState(database, userId, false, mutationInput(0))
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(await readSave(userId)).toEqual(beforeConflict);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("allows exactly one racing compare-and-swap update", async () => {
		const userId = await seedTestUser(database);
		try {
			await mutateGameStateWithState(database, userId, false, mutationInput(0));
			const results = await Promise.allSettled([
				mutateGameStateWithState(database, userId, false, mutationInput(1)),
				mutateGameStateWithState(database, userId, false, mutationInput(1)),
			]);
			const fulfilled = results.filter(
				(result) => result.status === "fulfilled"
			);
			const rejected = results.filter((result) => result.status === "rejected");

			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect(rejected[0]?.reason).toBeInstanceOf(TRPCError);
			expect(rejected[0]?.reason).toMatchObject({ code: "CONFLICT" });
			expect((await readSave(userId))?.revision).toBe(2);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("normalizes malformed persisted progression before saving", async () => {
		const userId = await seedTestUser(database);
		try {
			const state = createDefaultGameState(userId, new Date());
			await database.insert(gameState).values({
				...state,
				bestRunCans: 3,
				cans: 100,
				goldenCans: 3,
				goldenUpgrades: { "head-start": 99 },
				lastAccruedAt: new Date(Date.now() + 60_000),
				lifetimeCans: 1,
				manualClickBudget: 999,
				nextFrenzyClick: 0,
				producers: { "pull-tab": 2, unknown: 99 },
				runCans: 5,
				runUpgrades: ["cold-can", "cold-can", "unknown"],
				totalGoldenCans: 1,
			});

			await mutateGameStateWithState(database, userId, false, mutationInput(0));
			const save = await readSave(userId);

			expect(save?.cans).toBe(100);
			expect(save?.runCans).toBe(100);
			expect(save?.bestRunCans).toBe(100);
			expect(save?.lifetimeCans).toBe(100);
			expect(save?.goldenCans).toBe(3);
			expect(save?.totalGoldenCans).toBe(3);
			expect(save?.goldenUpgrades["head-start"]).toBe(4);
			expect(save?.producers.unknown).toBeUndefined();
			expect(save?.runUpgrades).toEqual(["cold-can"]);
			expect(save?.nextFrenzyClick).toBe(1);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});

	test("persists prestige reset and preservation fields atomically", async () => {
		const userId = await seedTestUser(database);
		try {
			const now = new Date();
			const state = createDefaultGameState(userId, now);
			state.cans = 120_000;
			state.runCans = 400_000;
			state.bestRunCans = 300_000;
			state.lifetimeCans = 25_000_000;
			state.runUpgrades = ["cold-can"];
			state.goldenUpgrades["golden-grip"] = 2;
			state.goldenUpgrades["head-start"] = 2;
			state.goldenCans = 1;
			state.totalGoldenCans = 3;
			state.prestigeLevel = 6;
			state.manualClickBudget = 37.5;
			state.goldenRushReadyAt = new Date(now.getTime() + 60_000);
			state.goldenRushBuffKind = "production_frenzy";
			state.goldenRushBuffEndsAt = new Date(now.getTime() + 30_000);
			state.shadowBanned = true;
			await database.insert(gameState).values(state);

			await mutateGameStateWithState(
				database,
				userId,
				false,
				mutationInput(0),
				prestige
			);
			const save = await readSave(userId);

			expect(save?.revision).toBe(1);
			expect(save?.cans).toBe(0);
			expect(save?.runCans).toBe(0);
			expect(save?.bestRunCans).toBe(400_000);
			expect(save?.lifetimeCans).toBe(25_000_000);
			expect(save?.runUpgrades).toEqual([]);
			expect(save?.producers["pull-tab"]).toBe(25);
			expect(save?.producers["monster-singularity"]).toBe(25);
			expect(save?.producers["taurine-comet"]).toBe(0);
			expect(save?.goldenUpgrades["golden-grip"]).toBe(2);
			expect(save?.goldenCans).toBe(3);
			expect(save?.totalGoldenCans).toBe(5);
			expect(save?.prestigeLevel).toBe(7);
			expect(save?.manualClickBudget).toBeGreaterThanOrEqual(37.5);
			expect(save?.goldenRushReadyAt).toEqual(state.goldenRushReadyAt);
			expect(save?.goldenRushBuffKind).toBe("production_frenzy");
			expect(save?.goldenRushBuffEndsAt).toEqual(state.goldenRushBuffEndsAt);
			expect(save?.shadowBanned).toBe(true);
		} finally {
			await deleteTestUsers(database, [userId]);
		}
	});
});
