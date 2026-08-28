ALTER TABLE "game_state" ADD COLUMN "ascension_nodes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "ascension_sparks" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "frenzy_stacks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "total_ascension_sparks" double precision DEFAULT 0 NOT NULL;