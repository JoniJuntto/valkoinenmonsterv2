ALTER TABLE "game_state" ADD COLUMN "golden_rush_buff_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "golden_rush_buff_kind" text;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "golden_rush_ready_at" timestamp with time zone;