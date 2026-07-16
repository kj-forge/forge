ALTER TABLE "exercises" DROP CONSTRAINT "exercises_slug_unique";--> statement-breakpoint
DROP INDEX "exercises_slug_idx";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "athlete_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "source_exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "is_loaded_bodyweight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_source_exercise_id_exercises_id_fk" FOREIGN KEY ("source_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_template_slug_uq" ON "exercises" USING btree ("slug") WHERE "exercises"."athlete_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_athlete_slug_uq" ON "exercises" USING btree ("athlete_id","slug") WHERE "exercises"."athlete_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exercises_athlete_idx" ON "exercises" USING btree ("athlete_id");--> statement-breakpoint
UPDATE "exercises" SET "is_loaded_bodyweight" = true WHERE "slug" IN ('pull-up', 'dip') AND "athlete_id" IS NULL;--> statement-breakpoint
INSERT INTO "exercises" ("athlete_id", "source_exercise_id", "slug", "name_pl", "name_en", "aliases", "category", "muscle_groups", "is_unilateral", "is_main_lift", "is_loaded_bodyweight", "default_unit", "progression_rule_id")
SELECT a."id", e."id", e."slug", e."name_pl", e."name_en", e."aliases", e."category", e."muscle_groups", e."is_unilateral", e."is_main_lift", e."is_loaded_bodyweight", e."default_unit", e."progression_rule_id"
FROM "athletes" a CROSS JOIN "exercises" e
WHERE e."athlete_id" IS NULL;--> statement-breakpoint
UPDATE "block_movements" bm SET "exercise_id" = own."id" FROM "exercises" own WHERE own."athlete_id" = bm."athlete_id" AND own."source_exercise_id" = bm."exercise_id";--> statement-breakpoint
UPDATE "goals" g SET "exercise_id" = own."id" FROM "exercises" own WHERE g."exercise_id" IS NOT NULL AND own."athlete_id" = g."athlete_id" AND own."source_exercise_id" = g."exercise_id";--> statement-breakpoint
UPDATE "training_plan_day_exercises" tpe SET "exercise_id" = own."id" FROM "exercises" own WHERE own."athlete_id" = tpe."athlete_id" AND own."source_exercise_id" = tpe."exercise_id";
