import {
	boolean,
	doublePrecision,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const gameState = pgTable("game_state", {
	bestRunCans: doublePrecision("best_run_cans").default(0).notNull(),
	cans: doublePrecision("cans").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	frenzyEndsAt: timestamp("frenzy_ends_at", { withTimezone: true }),
	goldenCans: integer("golden_cans").default(0).notNull(),
	goldenRushBuffEndsAt: timestamp("golden_rush_buff_ends_at", {
		withTimezone: true,
	}),
	goldenRushBuffKind: text("golden_rush_buff_kind"),
	goldenRushReadyAt: timestamp("golden_rush_ready_at", { withTimezone: true }),
	goldenUpgrades: jsonb("golden_upgrades")
		.$type<Record<string, number>>()
		.notNull(),
	lastAccruedAt: timestamp("last_accrued_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	lastOperationId: text("last_operation_id"),
	lifetimeCans: doublePrecision("lifetime_cans").default(0).notNull(),
	manualClickBudget: doublePrecision("manual_click_budget")
		.default(20)
		.notNull(),
	nextFrenzyClick: integer("next_frenzy_click").notNull(),
	prestigeLevel: integer("prestige_level").default(0).notNull(),
	producers: jsonb("producers").$type<Record<string, number>>().notNull(),
	revision: integer("revision").default(0).notNull(),
	runCans: doublePrecision("run_cans").default(0).notNull(),
	runUpgrades: jsonb("run_upgrades").$type<string[]>().notNull(),
	shadowBanned: boolean("shadow_banned").default(false).notNull(),
	totalGoldenCans: integer("total_golden_cans").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
});

export type GameStateRow = typeof gameState.$inferSelect;
