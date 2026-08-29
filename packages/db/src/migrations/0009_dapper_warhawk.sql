ALTER TABLE "game_state" ADD COLUMN "completed_contracts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "contract" jsonb;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "contract_completions" integer DEFAULT 0 NOT NULL;