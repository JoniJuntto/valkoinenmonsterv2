import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

import { getDrizzleDbCredentials } from "./src/pg-config";

dotenv.config({
	path: "../../apps/server/.env",
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
	dbCredentials: getDrizzleDbCredentials(databaseUrl),
	dialect: "postgresql",
	out: "./src/migrations",
	schema: "./src/schema",
});
