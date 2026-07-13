import { protectedProcedure, publicProcedure, router } from "../index";
import { gameRouter, leaderboardRouter } from "./game";

export const appRouter = router({
	game: gameRouter,
	healthCheck: publicProcedure.query(() => "OK"),
	leaderboard: leaderboardRouter,
	privateData: protectedProcedure.query(({ ctx }) => ({
		message: "This is private",
		user: ctx.session.user,
	})),
});
export type AppRouter = typeof appRouter;
