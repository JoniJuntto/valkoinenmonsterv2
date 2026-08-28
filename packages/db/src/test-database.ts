import { inArray } from "drizzle-orm";

import { createDatabaseConnection, type Database } from "./index";
import { user } from "./schema/auth";

export const connectTestDatabase = () => {
	const databaseUrl = process.env.TEST_DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("TEST_DATABASE_URL is required for integration tests");
	}
	return createDatabaseConnection(databaseUrl);
};

export const seedTestUser = async (
	database: Database,
	isAnonymous = false
): Promise<string> => {
	const userId = `test-${crypto.randomUUID()}`;
	await database.insert(user).values({
		email: `${userId}@example.test`,
		id: userId,
		isAnonymous,
		name: userId,
	});
	return userId;
};

export const deleteTestUsers = async (
	database: Database,
	userIds: string[]
): Promise<void> => {
	if (userIds.length > 0) {
		await database.delete(user).where(inArray(user.id, userIds));
	}
};
