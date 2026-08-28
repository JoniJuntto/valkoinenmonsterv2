ALTER TABLE "game_state" ADD COLUMN "draft_tier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "run_draft" jsonb;