import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		DATABASE_URL: z.string().min(1),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		RYBBIT_API_KEY: z.string().optional(),
		RYBBIT_SITE_ID: z.string().default("c7b355329e37"),
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
