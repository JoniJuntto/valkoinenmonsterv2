CREATE TABLE "season_state" (
	"cans" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accrued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_operation_id" text,
	"manual_click_budget" double precision DEFAULT 20 NOT NULL,
	"producers" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"season_id" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"upgrades" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "season_state_user_id_season_id_pk" PRIMARY KEY("user_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "season_state" ADD CONSTRAINT "season_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;