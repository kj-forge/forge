CREATE TABLE "training_plan_unit_step_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"exercise_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plan_unit_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"kind" "block_kind" NOT NULL,
	"target_rounds" integer,
	"duration_seconds" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_plan_unit_step_exercises" ADD CONSTRAINT "training_plan_unit_step_exercises_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_step_exercises" ADD CONSTRAINT "training_plan_unit_step_exercises_step_id_training_plan_unit_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."training_plan_unit_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_step_exercises" ADD CONSTRAINT "training_plan_unit_step_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_steps" ADD CONSTRAINT "training_plan_unit_steps_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_steps" ADD CONSTRAINT "training_plan_unit_steps_unit_id_training_plan_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."training_plan_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_plan_unit_step_exercises_step_idx" ON "training_plan_unit_step_exercises" USING btree ("step_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_unit_step_exercises_step_exercise_uq" ON "training_plan_unit_step_exercises" USING btree ("step_id","exercise_id");--> statement-breakpoint
CREATE INDEX "training_plan_unit_step_exercises_athlete_exercise_idx" ON "training_plan_unit_step_exercises" USING btree ("athlete_id","exercise_id");--> statement-breakpoint
CREATE INDEX "training_plan_unit_steps_unit_idx" ON "training_plan_unit_steps" USING btree ("unit_id","order_index");--> statement-breakpoint
-- Data migration 1/2: each flat unit exercise becomes its own single-exercise
-- WORK step. Step id reuses the legacy row id so the exercise copy is a plain
-- self-reference (0014 precedent).
INSERT INTO "training_plan_unit_steps" ("id", "athlete_id", "unit_id", "order_index", "kind")
SELECT e."id", e."athlete_id", e."unit_id", e."order_index", 'STRAIGHT_SETS'::"block_kind"
FROM "training_plan_unit_exercises" e;--> statement-breakpoint
INSERT INTO "training_plan_unit_step_exercises" ("athlete_id", "step_id", "order_index", "exercise_id")
SELECT e."athlete_id", e."id", 0, e."exercise_id"
FROM "training_plan_unit_exercises" e;--> statement-breakpoint
DROP TABLE "training_plan_unit_exercises" CASCADE;--> statement-breakpoint
-- Data migration 2/2: split legacy multi-movement STRAIGHT_SETS blocks into
-- one block per movement (every such block predates supersets). The movement
-- with the LOWEST order_index stays on the original block — "> min" instead
-- of "> 0" so blocks whose first movement was removed don't end up empty.
-- New block id reuses the movement id; sets follow block_movement_id, untouched.
INSERT INTO "session_blocks" ("id", "athlete_id", "session_id", "order_index", "kind", "created_at")
SELECT m."id", b."athlete_id", b."session_id", m."order_index", 'STRAIGHT_SETS'::"block_kind", b."created_at"
FROM "block_movements" m
JOIN "session_blocks" b ON b."id" = m."block_id"
WHERE b."kind" = 'STRAIGHT_SETS'
	AND m."order_index" > (SELECT min(m3."order_index") FROM "block_movements" m3 WHERE m3."block_id" = b."id");--> statement-breakpoint
UPDATE "block_movements" m
SET "block_id" = m."id", "order_index" = 0
FROM "session_blocks" nb
WHERE nb."id" = m."id";