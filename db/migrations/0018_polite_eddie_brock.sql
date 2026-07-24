CREATE TYPE "public"."day_slot" AS ENUM('MORNING', 'EVENING');--> statement-breakpoint
ALTER TABLE "block_movements" ADD COLUMN "removed_after_round" integer;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD COLUMN "slot" "day_slot" DEFAULT 'MORNING' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_plan_unit_days" ADD COLUMN "slot" "day_slot" DEFAULT 'MORNING' NOT NULL;