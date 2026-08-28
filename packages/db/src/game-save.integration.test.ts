import { afterAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";

import { gameState } from "./schema/game";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
	throw new Error("TEST_DATABASE_URL is required for integration tests");
}

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3001";
process.env.DATABASE_URL = testDatabaseUrl;

const { transferBestGameState } = await import("./index");
const { connectTestDatabase, deleteTestUsers, seedTestUser } = await import(
	"./test-database"
);

const connection = connectTestDatabase();
const { database } = connection;

afterAll(async () => {
	await connection.close();
});

const insertSave = async (
	userId: string,
	lifetimeCans: number,
	marker: number
): Promise<void> => {
	await database.insert(gameState).values({
		cans: marker,
		goldenUpgrades: { marker },
		lifetimeCans,
		nextFrenzyClick: 1,
		producers: { marker },
		runUpgrades: [`marker-${marker}`],
		userId,
	});
};

const readSaves = (userIds: string[]) =>
	database.select().from(gameState).where(inArray(gameState.userId, userIds));

const runTransferCase = async (
	anonymousLifetime: number,
	registeredLifetime?: number
) => {
	const anonymousUserId = await seedTestUser(database, true);
	const registeredUserId = await seedTestUser(database);
	try {
		await insertSave(anonymousUserId, anonymousLifetime, 11);
		if (registeredLifetime !== undefined) {
			await insertSave(registeredUserId, registeredLifetime, 22);
		}

		await transferBestGameState(database, anonymousUserId, registeredUserId);
		return {
			registeredUserId,
			saves: await readSaves([anonymousUserId, registeredUserId]),
		};
	} finally {
		await deleteTestUsers(database, [anonymousUserId, registeredUserId]);
	}
};

describe("PostgreSQL anonymous save transfer", () => {
	test("reassigns an anonymous-only save as one whole row", async () => {
		const { registeredUserId, saves } = await runTransferCase(10);
		expect(saves).toHaveLength(1);
		expect(saves[0]?.userId).toBe(registeredUserId);
		expect(saves[0]?.cans).toBe(11);
		expect(saves[0]?.producers).toEqual({ marker: 11 });
	});

	test("replaces a lower registered save with the anonymous row", async () => {
		const { registeredUserId, saves } = await runTransferCase(11, 10);
		expect(saves).toHaveLength(1);
		expect(saves[0]?.userId).toBe(registeredUserId);
		expect(saves[0]?.cans).toBe(11);
		expect(saves[0]?.goldenUpgrades).toEqual({ marker: 11 });
	});

	test("keeps the registered row when lifetime progress ties", async () => {
		const { registeredUserId, saves } = await runTransferCase(10, 10);
		expect(saves).toHaveLength(1);
		expect(saves[0]?.userId).toBe(registeredUserId);
		expect(saves[0]?.cans).toBe(22);
		expect(saves[0]?.runUpgrades).toEqual(["marker-22"]);
	});

	test("keeps the higher registered row", async () => {
		const { registeredUserId, saves } = await runTransferCase(9, 10);
		expect(saves).toHaveLength(1);
		expect(saves[0]?.userId).toBe(registeredUserId);
		expect(saves[0]?.cans).toBe(22);
		expect(saves[0]?.lifetimeCans).toBe(10);
	});
});
