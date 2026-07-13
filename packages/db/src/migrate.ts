import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { getPgPoolConfig } from "./pg-config";

dotenv.config({
	path: "../../apps/server/.env",
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

const pool = new Pool(getPgPoolConfig(databaseUrl));
const db = drizzle(pool);

try {
	await migrate(db, {
		migrationsFolder: path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"migrations"
		),
	});
	console.log("Migrations applied successfully");
} finally {
	await pool.end();
}
