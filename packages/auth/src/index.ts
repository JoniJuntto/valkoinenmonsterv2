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
			sendResetPassword: async ({ user, url }) => {
				if (!env.RESEND_API_KEY) {
					// ponytail: no mail provider in dev — log the link, swap for a real
					// provider only if Resend stops being enough
					process.stdout.write(`Password reset for ${user.email}: ${url}\n`);
					return;
				}

				const res = await fetch("https://api.resend.com/emails", {
					body: JSON.stringify({
						from: env.EMAIL_FROM,
						subject: "Reset your Valkoinen Monster password",
						text: `Reset your password: ${url}\n\nThe link expires in an hour. If you didn't ask for this, ignore this email.`,
						to: user.email,
					}),
					headers: {
						Authorization: `Bearer ${env.RESEND_API_KEY}`,
						"Content-Type": "application/json",
					},
					method: "POST",
				});

				if (!res.ok) {
					throw new Error(
						`Resend rejected reset email: ${res.status} ${await res.text()}`
					);
				}
			},
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
