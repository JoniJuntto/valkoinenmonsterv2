import { env } from "@valkoinenmonsterv2/env/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { shouldTransferAnonymousSave } from "./game-save";
import { getPgPoolConfig } from "./pg-config";
import * as schema from "./schema";
import { gameState } from "./schema/game";

export { shouldTransferAnonymousSave } from "./game-save";

let pool: Pool | undefined;

function getPool() {
	if (!pool) {
		pool = new Pool(getPgPoolConfig(env.DATABASE_URL));
	}

	return pool;
}

export function createDb() {
	return drizzle(getPool(), { schema });
}

export const db = createDb();

export const transferBestGameState = async (
	database: ReturnType<typeof createDb>,
	anonymousUserId: string,
	registeredUserId: string
) => {
	await database.transaction(async (transaction) => {
		const [anonymousSave] = await transaction
			.select()
			.from(gameState)
			.where(eq(gameState.userId, anonymousUserId))
			.limit(1);
		if (!anonymousSave) {
			return;
		}

		const [registeredSave] = await transaction
			.select()
			.from(gameState)
			.where(eq(gameState.userId, registeredUserId))
			.limit(1);
		if (
			registeredSave &&
			!shouldTransferAnonymousSave(
				anonymousSave.lifetimeCans,
				registeredSave.lifetimeCans
			)
		) {
			await transaction
				.delete(gameState)
				.where(eq(gameState.userId, anonymousUserId));
			return;
		}

		if (registeredSave) {
			await transaction
				.delete(gameState)
				.where(eq(gameState.userId, registeredUserId));
		}
		await transaction
			.update(gameState)
			.set({ userId: registeredUserId })
			.where(eq(gameState.userId, anonymousUserId));
	});
};
