ALTER TABLE "exercises" ADD COLUMN "is_pr_tracked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "target_reps" integer DEFAULT 1 NOT NULL;