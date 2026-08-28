ALTER TABLE "game_state" ADD COLUMN "collection" jsonb DEFAULT '[]'::jsonb NOT NULL;
