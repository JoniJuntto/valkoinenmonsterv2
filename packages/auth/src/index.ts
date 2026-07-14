import { createDb, transferBestGameState } from "@valkoinenmonsterv2/db";
import {
	bucketCans,
	trackServerEvent,
} from "@valkoinenmonsterv2/db/rybbit-track";
import * as schema from "@valkoinenmonsterv2/db/schema/auth";
import { gameState } from "@valkoinenmonsterv2/db/schema/game";
import { env } from "@valkoinenmonsterv2/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins/anonymous";
import { eq } from "drizzle-orm";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		advanced: {
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: "none",
				secure: true,
			},
		},
		baseURL: env.BETTER_AUTH_URL,
		database: drizzleAdapter(db, {
			provider: "pg",

			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			anonymous({
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					const [anonymousSave] = await db
						.select({ lifetimeCans: gameState.lifetimeCans })
						.from(gameState)
						.where(eq(gameState.userId, anonymousUser.user.id))
						.limit(1);

					await transferBestGameState(
						db,
						anonymousUser.user.id,
						newUser.user.id
					);

					trackServerEvent(
						"auth.account_linked",
						{
							anonymous_lifetime_cans_bucket: bucketCans(
								anonymousSave?.lifetimeCans ?? 0
							),
							transfer_occurred: Boolean(anonymousSave),
						},
						newUser.user.id
					).catch(() => undefined);
				},
			}),
		],
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.CORS_ORIGIN],
	});
}

export const auth = createAuth();
