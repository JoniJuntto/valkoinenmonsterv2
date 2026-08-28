ALTER TABLE "game_state" ADD COLUMN "coolant" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "coolant_towers" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "vented_walls" jsonb DEFAULT '[]'::jsonb NOT NULL;