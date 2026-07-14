ALTER TABLE "exercises" ADD COLUMN "is_main_lift" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "exercises" SET "is_main_lift" = true WHERE "slug" IN ('back-squat', 'deadlift', 'bench-press', 'overhead-press');
