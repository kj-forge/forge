DROP INDEX "block_movements_block_exercise_uq";--> statement-breakpoint
DROP INDEX "training_plan_unit_step_exercises_step_exercise_uq";--> statement-breakpoint
ALTER TABLE "block_movements" ADD COLUMN "target_reps" integer;--> statement-breakpoint
ALTER TABLE "training_plan_unit_step_exercises" ADD COLUMN "target_reps" integer;--> statement-breakpoint
ALTER TABLE "training_plan_unit_step_exercises" ADD COLUMN "target_distance_m" integer;--> statement-breakpoint
ALTER TABLE "training_plan_unit_steps" ADD COLUMN "rest_seconds" integer;