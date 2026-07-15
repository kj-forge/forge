CREATE TABLE "training_plan_day_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"plan_day_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"exercise_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_plan_days" ADD COLUMN "has_strength" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "training_plan_day_exercises" ADD CONSTRAINT "training_plan_day_exercises_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_day_exercises" ADD CONSTRAINT "training_plan_day_exercises_plan_day_id_training_plan_days_id_fk" FOREIGN KEY ("plan_day_id") REFERENCES "public"."training_plan_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_day_exercises" ADD CONSTRAINT "training_plan_day_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_plan_day_exercises_day_idx" ON "training_plan_day_exercises" USING btree ("plan_day_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_day_exercises_day_exercise_uq" ON "training_plan_day_exercises" USING btree ("plan_day_id","exercise_id");