CREATE TYPE "public"."plan_intensity" AS ENUM('HARD', 'MEDIUM', 'EASY', 'RESET');--> statement-breakpoint
CREATE TABLE "training_plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"intensity" "plan_intensity" NOT NULL,
	"training" text NOT NULL,
	"goal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_plan_days" ADD CONSTRAINT "training_plan_days_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_days_athlete_day_idx" ON "training_plan_days" USING btree ("athlete_id","day_of_week");