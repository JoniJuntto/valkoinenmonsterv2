import { cors } from "@elysiajs/cors";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@valkoinenmonsterv2/api/context";
import {
	agentGameCommandSchema,
	runAgentGameCommand,
} from "@valkoinenmonsterv2/api/routers/game";
import { appRouter } from "@valkoinenmonsterv2/api/routers/index";
import { auth } from "@valkoinenmonsterv2/auth";
import { env } from "@valkoinenmonsterv2/env/server";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { evlog } from "evlog/elysia";

initLogger({
	env: { service: "valkoinenmonsterv2-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: ["/api/auth/**"],
	maskEmail: true,
});

const app = new Elysia()
	.use(evlog())
	.derive(async ({ request, log }) => {
		await identifyUser(log, request.headers, new URL(request.url).pathname);
		return {};
	})
	.use(
		cors({
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
			methods: ["GET", "POST", "OPTIONS"],
			origin: env.CORS_ORIGIN,
		})
	)
	.all("/api/auth/*", (context) => {
		const { request, status } = context;
		if (["POST", "GET"].includes(request.method)) {
			return auth.handler(request);
		}
		return status(405);
	})
	.all("/trpc/*", async (context) => {
		const res = await fetchRequestHandler({
			createContext: () => createContext({ context }),
			endpoint: "/trpc",
			req: context.request,
			router: appRouter,
		});
		return res;
	})
	.get("/", () => "OK");

if (env.NODE_ENV !== "production") {
	app.post(
		"/api/game/json",
		async ({ body, request, status }) => {
			const session = await auth.api.getSession({ headers: request.headers });
			if (!session) {
				return status(401, {
					error: { code: "UNAUTHORIZED", message: "Authentication required" },
				});
			}
			try {
				return await runAgentGameCommand(
					session.user.id,
					Boolean(session.user.isAnonymous),
					body
				);
			} catch (error) {
				if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
					return status(400, {
						error: { code: error.code, message: error.message },
					});
				}
				if (error instanceof TRPCError && error.code === "CONFLICT") {
					return status(409, {
						error: { code: error.code, message: error.message },
					});
				}
				throw error;
			}
		},
		{ body: agentGameCommandSchema }
	);
}

app.listen(6283, () => {
	console.log("Server is running on http://localhost:6283");
});
