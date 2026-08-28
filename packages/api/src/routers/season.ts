import { TRPCError } from "@trpc/server";
import { type Database, db } from "@valkoinenmonsterv2/db";
import { trackServerEvent } from "@valkoinenmonsterv2/db/rybbit-track";
import { user } from "@valkoinenmonsterv2/db/schema/auth";
import {
	gameState,
	type SeasonStateRow,
	seasonState,
} from "@valkoinenmonsterv2/db/schema/game";
import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import {
	accrueSeasonState,
	calculateSeasonClickValue,
	calculateSeasonCps,
	createSeasonProducers,
	getSeasonProducer,
	getSeasonTheme,
	getSeasonUpgrade,
	resolveSeason,
	type SeasonInfo,
	seasonProducerBulkCost,
} from "../seasons";
import { getMutationDisposition } from "./game";

const SEASON_LEADERBOARD_SIZE = 50;
const SEASON_MAX_CLICK_BUDGET = 120;

export interface SeasonSnapshot {
	cans: number;
	clickValue: number;
	cps: number;
	lastAccruedAt: number;
	manualClickBudget: number;
	producers: Record<string, number>;
	revision: number;
	score: number;
	upgrades: string[];
}

export interface SeasonLeaderboardRow {
	name: string;
	rank: number;
	score: number;
	userId: string;
}

export interface SeasonOverview {
	leaderboard: SeasonLeaderboardRow[];
	season: SeasonInfo;
	serverNow: number;
	snapshot: SeasonSnapshot;
	viewerRank: number | null;
}

type SeasonMutation = (state: SeasonStateRow, now: Date) => SeasonStateRow;

interface SeasonMutationResult {
	acceptedClicks: number;
	replayed: boolean;
	snapshot: SeasonSnapshot;
}

const seasonInput = z.object({
	operationId: z.uuid(),
	pendingManualClicks: z.number().int().min(0).max(10_000),
	revision: z.number().int().nonnegative(),
});

const clampSeasonCounter = (value: number): number =>
	Math.min(
		2_147_483_647,
		Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
	);

const clampGameValueSafe = (value: number): number =>
	Number.isFinite(value) && value > 0 ? Math.min(value, 1e300) : 0;

const normalizeSeasonProducers = (
	value: unknown,
	themeId: string
): Record<string, number> => {
	const producers = createSeasonProducers(themeId);
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return producers;
	}
	const stored = value as Record<string, unknown>;
	for (const producer of getSeasonTheme(themeId).producers) {
		const owned = stored[producer.id];
		producers[producer.id] = clampSeasonCounter(
			typeof owned === "number" ? owned : 0
		);
	}
	return producers;
};

const normalizeSeasonState = (
	row: SeasonStateRow,
	themeId: string,
	now: Date
): SeasonStateRow => {
	const cans = clampGameValueSafe(row.cans);
	const upgrades = Array.isArray(row.upgrades)
		? [
				...new Set(
					row.upgrades.filter(
						(id) => getSeasonUpgrade(themeId, id) !== undefined
					)
				),
			]
		: [];
	const lastAccruedAt =
		row.lastAccruedAt instanceof Date &&
		Number.isFinite(row.lastAccruedAt.getTime()) &&
		row.lastAccruedAt.getTime() <= now.getTime()
			? row.lastAccruedAt
			: now;
	return {
		...row,
		cans,
		lastAccruedAt,
		manualClickBudget: Math.min(
			SEASON_MAX_CLICK_BUDGET,
			Math.max(
				0,
				Number.isFinite(row.manualClickBudget) ? row.manualClickBudget : 0
			)
		),
		producers: normalizeSeasonProducers(row.producers, themeId),
		revision: clampSeasonCounter(row.revision),
		score: Math.max(cans, clampGameValueSafe(row.score)),
		upgrades,
	};
};

const toSeasonSnapshot = (
	state: SeasonStateRow,
	themeId: string
): SeasonSnapshot => ({
	cans: state.cans,
	clickValue: calculateSeasonClickValue(themeId, state.upgrades),
	cps: calculateSeasonCps(themeId, state.producers, state.upgrades),
	lastAccruedAt: state.lastAccruedAt.getTime(),
	manualClickBudget: state.manualClickBudget,
	producers: state.producers,
	revision: state.revision,
	score: state.score,
	upgrades: state.upgrades,
});

const insufficientFunds = () =>
	new TRPCError({
		code: "BAD_REQUEST",
		message: "Not enough season cans",
	});

export const buySeasonProducer = (
	themeId: string,
	producerId: string,
	quantity = 1
): SeasonMutation => {
	const producer = getSeasonProducer(themeId, producerId);
	if (!producer) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown producer" });
	}
	return (state) => {
		const owned = state.producers[producerId] ?? 0;
		const cost = seasonProducerBulkCost(producer, owned, quantity);
		if (state.cans < cost) {
			throw insufficientFunds();
		}
		return {
			...state,
			cans: state.cans - cost,
			producers: { ...state.producers, [producerId]: owned + quantity },
		};
	};
};

export const buySeasonUpgrade = (
	themeId: string,
	upgradeId: string
): SeasonMutation => {
	const upgrade = getSeasonUpgrade(themeId, upgradeId);
	if (!upgrade) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown upgrade" });
	}
	return (state) => {
		if (state.upgrades.includes(upgradeId)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Upgrade is locked",
			});
		}
		if (state.cans < upgrade.cost) {
			throw insufficientFunds();
		}
		return {
			...state,
			cans: state.cans - upgrade.cost,
			upgrades: [...state.upgrades, upgradeId],
		};
	};
};

const ensureSeasonState = async (
	database: Database,
	userId: string,
	season: SeasonInfo
): Promise<SeasonStateRow> => {
	const [inserted] = await database
		.insert(seasonState)
		.values({
			producers: createSeasonProducers(season.themeId),
			seasonId: season.id,
			upgrades: [],
			userId,
		})
		.onConflictDoNothing()
		.returning();
	if (inserted) {
		trackServerEvent(
			"game.season.joined",
			{ season_id: season.id },
			userId
		).catch(() => undefined);
		return inserted;
	}
	const [existing] = await database
		.select()
		.from(seasonState)
		.where(
			and(eq(seasonState.userId, userId), eq(seasonState.seasonId, season.id))
		)
		.limit(1);
	if (!existing) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Season save unavailable",
		});
	}
	return existing;
};

export const runSeasonMutation = async (
	database: Database,
	userId: string,
	season: SeasonInfo,
	input: { operationId: string; pendingManualClicks: number; revision: number },
	mutation: SeasonMutation = (state) => state
): Promise<SeasonMutationResult> => {
	const serverNow = Date.now();
	const now = new Date(serverNow);
	const current = normalizeSeasonState(
		await ensureSeasonState(database, userId, season),
		season.themeId,
		now
	);
	// ponytail: revision -1 = server-internal pass (season.current accrual), skip the client revision gate
	const disposition =
		input.revision < 0 ? "apply" : getMutationDisposition(current, input);
	if (disposition === "retry") {
		return {
			acceptedClicks: 0,
			replayed: true,
			snapshot: toSeasonSnapshot(current, season.themeId),
		};
	}
	const { acceptedClicks, state: accrued } = accrueSeasonState(
		season.themeId,
		current,
		input.pendingManualClicks,
		now
	);
	const mutated = mutation(accrued, now);
	const [saved] = await database
		.update(seasonState)
		.set({
			...mutated,
			lastOperationId: input.operationId,
			revision: current.revision + 1,
			updatedAt: now,
		})
		.where(
			and(
				eq(seasonState.userId, userId),
				eq(seasonState.seasonId, season.id),
				eq(seasonState.revision, current.revision)
			)
		)
		.returning();
	if (!saved) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Season state changed; reloading",
		});
	}
	return {
		acceptedClicks,
		replayed: false,
		snapshot: toSeasonSnapshot(saved, season.themeId),
	};
};

const rankSeasonLeaderboard = (
	rows: Omit<SeasonLeaderboardRow, "rank">[]
): SeasonLeaderboardRow[] =>
	rows
		.sort((left, right) => right.score - left.score)
		.map((row, index) => ({ ...row, rank: index + 1 }));

const sessionIsAnonymous = (session: {
	user: { isAnonymous?: boolean | null };
}): boolean => Boolean(session.user.isAnonymous);

const getSeasonOverview = async (
	userId: string,
	isAnonymous: boolean
): Promise<SeasonOverview> => {
	const season = resolveSeason(Date.now());
	const { snapshot } = await runSeasonMutation(db, userId, season, {
		operationId: crypto.randomUUID(),
		pendingManualClicks: 0,
		revision: -1,
	});

	const publicRows = await db
		.select({
			name: user.name,
			score: seasonState.score,
			userId: seasonState.userId,
		})
		.from(seasonState)
		.innerJoin(user, eq(seasonState.userId, user.id))
		.innerJoin(gameState, eq(seasonState.userId, gameState.userId))
		.where(
			and(
				eq(seasonState.seasonId, season.id),
				eq(gameState.shadowBanned, false),
				eq(user.isAnonymous, false)
			)
		)
		.orderBy(desc(seasonState.score), asc(seasonState.createdAt))
		.limit(SEASON_LEADERBOARD_SIZE);
	const leaderboard = rankSeasonLeaderboard(publicRows);

	let viewerRank: number | null = null;
	if (!isAnonymous) {
		const [tallied] = await db
			.select({ above: count() })
			.from(seasonState)
			.innerJoin(gameState, eq(seasonState.userId, gameState.userId))
			.innerJoin(user, eq(seasonState.userId, user.id))
			.where(
				and(
					eq(seasonState.seasonId, season.id),
					eq(gameState.shadowBanned, false),
					eq(user.isAnonymous, false),
					gt(seasonState.score, snapshot.score)
				)
			);
		viewerRank = Number(tallied?.above ?? 0) + 1;
	}

	return {
		leaderboard,
		season,
		serverNow: Date.now(),
		snapshot,
		viewerRank,
	};
};

export const seasonRouter = router({
	buyProducer: protectedProcedure
		.input(
			seasonInput.extend({
				producerId: z.string(),
				quantity: z.number().int().min(1).max(100).optional(),
			})
		)
		.mutation(({ ctx, input }) => {
			const season = resolveSeason(Date.now());
			return runSeasonMutation(
				db,
				ctx.session.user.id,
				season,
				input,
				buySeasonProducer(season.themeId, input.producerId, input.quantity ?? 1)
			);
		}),
	buyUpgrade: protectedProcedure
		.input(seasonInput.extend({ upgradeId: z.string() }))
		.mutation(({ ctx, input }) => {
			const season = resolveSeason(Date.now());
			return runSeasonMutation(
				db,
				ctx.session.user.id,
				season,
				input,
				buySeasonUpgrade(season.themeId, input.upgradeId)
			);
		}),
	current: protectedProcedure.query(({ ctx }) =>
		getSeasonOverview(ctx.session.user.id, sessionIsAnonymous(ctx.session))
	),
	sync: protectedProcedure.input(seasonInput).mutation(({ ctx, input }) => {
		const season = resolveSeason(Date.now());
		return runSeasonMutation(db, ctx.session.user.id, season, input);
	}),
});
