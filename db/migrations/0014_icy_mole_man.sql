CREATE TYPE "public"."plan_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."schedule_override_kind" AS ENUM('SKIP', 'ADD', 'ADHOC');--> statement-breakpoint
CREATE TYPE "public"."unit_intensity" AS ENUM('HARD', 'MEDIUM', 'EASY');--> statement-breakpoint
CREATE TABLE "schedule_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "schedule_override_kind" NOT NULL,
	"unit_id" uuid,
	"session_type" "session_type",
	"name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plan_unit_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plan_unit_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"exercise_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plan_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"name" text NOT NULL,
	"session_type" "session_type" NOT NULL,
	"intensity" "unit_intensity" NOT NULL,
	"training" text DEFAULT '' NOT NULL,
	"goal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "plan_status" DEFAULT 'DRAFT' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_unit_id_training_plan_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."training_plan_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_days" ADD CONSTRAINT "training_plan_unit_days_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_days" ADD CONSTRAINT "training_plan_unit_days_unit_id_training_plan_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."training_plan_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_exercises" ADD CONSTRAINT "training_plan_unit_exercises_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_exercises" ADD CONSTRAINT "training_plan_unit_exercises_unit_id_training_plan_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."training_plan_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_unit_exercises" ADD CONSTRAINT "training_plan_unit_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_units" ADD CONSTRAINT "training_plan_units_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan_units" ADD CONSTRAINT "training_plan_units_plan_id_training_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_overrides_athlete_date_idx" ON "schedule_overrides" USING btree ("athlete_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_overrides_unit_date_kind_uq" ON "schedule_overrides" USING btree ("unit_id","date","kind") WHERE unit_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_unit_days_unit_day_uq" ON "training_plan_unit_days" USING btree ("unit_id","day_of_week");--> statement-breakpoint
CREATE INDEX "training_plan_unit_days_athlete_day_idx" ON "training_plan_unit_days" USING btree ("athlete_id","day_of_week");--> statement-breakpoint
CREATE INDEX "training_plan_unit_exercises_unit_idx" ON "training_plan_unit_exercises" USING btree ("unit_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plan_unit_exercises_unit_exercise_uq" ON "training_plan_unit_exercises" USING btree ("unit_id","exercise_id");--> statement-breakpoint
CREATE INDEX "training_plan_units_plan_order_idx" ON "training_plan_units" USING btree ("plan_id","order_index");--> statement-breakpoint
CREATE INDEX "training_plans_athlete_status_idx" ON "training_plans" USING btree ("athlete_id","status");--> statement-breakpoint
-- Data migration: fold the legacy weekday-keyed plan into one ACTIVE
-- "Plan tygodnia" per athlete. Unit ids reuse the legacy day-row ids so the
-- exercise and assignment copies below are plain joins. RESET days are
-- skipped — rest is now simply an unassigned day.
INSERT INTO "training_plans" ("athlete_id", "name", "status", "start_date")
SELECT DISTINCT "athlete_id", 'Plan tygodnia', 'ACTIVE'::"plan_status", date_trunc('week', now() AT TIME ZONE 'Europe/Warsaw')::date
FROM "training_plan_days";--> statement-breakpoint
INSERT INTO "training_plan_units" ("id","athlete_id","plan_id","order_index","name","session_type","intensity","training","goal","created_at","updated_at")
SELECT d."id", d."athlete_id", p."id", d."day_of_week",
	coalesce(
		nullif(left(btrim(split_part(d."training", E'\n', 1)), 60), ''),
		(ARRAY['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'])[d."day_of_week" + 1]
	),
	CASE WHEN d."has_strength" THEN 'STRENGTH' ELSE 'OTHER' END::"session_type",
	(d."intensity"::text)::"unit_intensity",
	d."training", d."goal", d."created_at", d."updated_at"
FROM "training_plan_days" d
JOIN "training_plans" p ON p."athlete_id" = d."athlete_id"
WHERE d."intensity" <> 'RESET';--> statement-breakpoint
INSERT INTO "training_plan_unit_exercises" ("id","athlete_id","unit_id","order_index","exercise_id")
SELECT e."id", e."athlete_id", e."plan_day_id", e."order_index", e."exercise_id"
FROM "training_plan_day_exercises" e
JOIN "training_plan_units" u ON u."id" = e."plan_day_id";--> statement-breakpoint
INSERT INTO "training_plan_unit_days" ("athlete_id","unit_id","day_of_week")
SELECT d."athlete_id", d."id", d."day_of_week"
FROM "training_plan_days" d
WHERE d."intensity" <> 'RESET';--> statement-breakpoint
DROP TABLE "training_plan_day_exercises" CASCADE;--> statement-breakpoint
DROP TABLE "training_plan_days" CASCADE;--> statement-breakpoint
DROP TABLE "weekly_templates" CASCADE;--> statement-breakpoint
DROP TYPE "public"."plan_intensity";