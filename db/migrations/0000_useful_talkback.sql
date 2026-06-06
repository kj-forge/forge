CREATE TYPE "public"."ai_prompt_type" AS ENUM('WEEKLY_SUMMARY', 'CONVERSATIONAL_LOG', 'NL_QUERY', 'VOICE_STRUCTURE', 'PHOTO_OCR', 'PLAN_GENERATION', 'CLASSIFICATION');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('OPENROUTER', 'ANTHROPIC_DIRECT', 'OPENAI_DIRECT', 'DEEPGRAM');--> statement-breakpoint
CREATE TYPE "public"."block_kind" AS ENUM('STRAIGHT_SETS', 'EMOM', 'AMRAP', 'WORK_INTERVAL', 'REST');--> statement-breakpoint
CREATE TYPE "public"."cardio_modality" AS ENUM('RUN', 'BIKE', 'ROW', 'SKI', 'SWIM', 'MIXED');--> statement-breakpoint
CREATE TYPE "public"."cardio_zone" AS ENUM('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'THRESHOLD', 'COMPROMISED');--> statement-breakpoint
CREATE TYPE "public"."coach_role" AS ENUM('PRIMARY', 'BACKUP', 'VIEWER', 'PHYSIO');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('TERMS', 'PRIVACY', 'MARKETING', 'RESEARCH', 'AI_TRAINING');--> statement-breakpoint
CREATE TYPE "public"."data_export_status" AS ENUM('PENDING', 'READY', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."exercise_category" AS ENUM('MAIN_LIFT', 'ACCESSORY', 'BODYWEIGHT', 'HYROX_STATION', 'REHAB');--> statement-breakpoint
CREATE TYPE "public"."exercise_unit" AS ENUM('REPS', 'TIME', 'DISTANCE', 'CALORIES');--> statement-breakpoint
CREATE TYPE "public"."goal_progress_source" AS ENUM('MANUAL', 'AUTO_FROM_SESSION', 'AI_ESTIMATE');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('STRENGTH_RM', 'RACE_TIME', 'BODY_COMP', 'CONSISTENCY');--> statement-breakpoint
CREATE TYPE "public"."hyrox_station_slug" AS ENUM('SKI_ERG', 'SLED_PUSH', 'SLED_PULL', 'BURPEE_BROAD_JUMPS', 'ROWING', 'FARMERS_CARRY', 'SANDBAG_LUNGES', 'WALL_BALLS');--> statement-breakpoint
CREATE TYPE "public"."hyrox_station_unit" AS ENUM('REPS', 'DISTANCE');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('MANUAL_FIT', 'GARMIN_HEALTH_API', 'STRAVA', 'WHOOP', 'APPLE_HEALTH', 'MANUAL_ENTRY');--> statement-breakpoint
CREATE TYPE "public"."injury_event_kind" AS ENUM('DIAGNOSIS', 'USG', 'MRI', 'ORTHO_VISIT', 'PHYSIO_VISIT', 'FLARE_UP', 'MILESTONE', 'NOTE');--> statement-breakpoint
CREATE TYPE "public"."progression_kind" AS ENUM('TOP_SET_BACKOFF', 'STRAIGHT_SETS', 'ENDURANCE_STRENGTH', 'RPE_CAPPED', 'QUALITY_FIRST');--> statement-breakpoint
CREATE TYPE "public"."session_source" AS ENUM('MANUAL', 'IMPORTED');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('STRENGTH', 'HYROX_EMOM', 'HYROX_AMRAP', 'HYROX_WORK', 'CARDIO', 'COMPROMISED_RUN', 'REHAB', 'MOBILITY');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('LEFT', 'RIGHT', 'BILATERAL');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIAL', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('FREE', 'PRO', 'COACH', 'PHYSIO', 'CLINIC', 'LIFETIME');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"provider" "ai_provider" DEFAULT 'OPENROUTER' NOT NULL,
	"model" text NOT NULL,
	"prompt_type" "ai_prompt_type" NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_code" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_coach_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"role" "coach_role" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_athlete_id" uuid NOT NULL,
	"followed_athlete_id" uuid NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_public_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"public_slug" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"display_bio" text,
	"display_avatar_url" text,
	"display_race_results_public" boolean DEFAULT false NOT NULL,
	"display_pr_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_public_profiles_athleteId_unique" UNIQUE("athlete_id"),
	CONSTRAINT "athlete_public_profiles_publicSlug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"username" text NOT NULL,
	"bio" text,
	"born_at" date,
	"sex" text,
	"height_cm" double precision,
	"weight_kg" double precision,
	"locale" text DEFAULT 'pl' NOT NULL,
	"timezone" text DEFAULT 'Europe/Warsaw' NOT NULL,
	"subscription_tier" "subscription_tier" DEFAULT 'FREE' NOT NULL,
	"subscription_status" "subscription_status" DEFAULT 'NONE' NOT NULL,
	"last_seen_ip" text,
	"last_seen_user_agent" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athletes_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "block_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"exercise_id" uuid NOT NULL,
	"target_reps" integer,
	"target_weight_kg" double precision,
	"target_duration_seconds" integer,
	"target_distance_m" integer,
	"target_calories" integer,
	"rpe_cap" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardio_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"modality" "cardio_modality" NOT NULL,
	"zone" "cardio_zone",
	"duration_seconds" integer,
	"distance_m" integer,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_pace_sec_per_km" integer,
	"avg_power_w" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bio" text,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"athlete_id" uuid NOT NULL,
	"day" date NOT NULL,
	"sleep_score0100" smallint,
	"sleep_minutes" integer,
	"hrv_ms" integer,
	"hr_rest_bpm" smallint,
	"body_battery" smallint,
	"recovery_minutes" integer,
	"training_load_score" double precision,
	"mood15" smallint,
	"energy15" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_athlete_id_day_pk" PRIMARY KEY("athlete_id","day")
);
--> statement-breakpoint
CREATE TABLE "data_export_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "data_export_status" DEFAULT 'PENDING' NOT NULL,
	"download_url" text,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_pl" text NOT NULL,
	"name_en" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" "exercise_category" NOT NULL,
	"muscle_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	"default_unit" "exercise_unit" DEFAULT 'REPS' NOT NULL,
	"progression_rule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "goal_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_value" double precision NOT NULL,
	"distance_to_target" double precision,
	"source" "goal_progress_source" DEFAULT 'MANUAL' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"type" "goal_type" NOT NULL,
	"title" text NOT NULL,
	"target_value" double precision,
	"target_unit" text,
	"target_date" date,
	"started_at" date,
	"achieved_at" date,
	"source_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hyrox_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "hyrox_station_slug" NOT NULL,
	"name_pl" text NOT NULL,
	"name_en" text NOT NULL,
	"default_reps_or_distance" integer NOT NULL,
	"unit" "hyrox_station_unit" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body_region" text NOT NULL,
	"side" "side",
	"started_at" date,
	"resolved_at" date,
	"severity010" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injury_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"injury_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" "injury_event_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_extracted" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"injury_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dosage" text,
	"frequency" text,
	"started_at" date,
	"ended_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pain_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body_region" text NOT NULL,
	"side" "side",
	"severity010" smallint NOT NULL,
	"context" text,
	"is_morning" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progression_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "progression_kind" NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"event_date" date NOT NULL,
	"location" text,
	"division" text,
	"total_time_seconds" integer,
	"station_splits" jsonb DEFAULT '{}'::jsonb,
	"placement_overall" integer,
	"placement_division" integer,
	"source_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_athlete_id" uuid NOT NULL,
	"referred_email" text NOT NULL,
	"referred_athlete_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_up_at" timestamp with time zone,
	"converted_to_paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rehab_protocol_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"exercise_name_pl" text NOT NULL,
	"sets" integer,
	"reps_or_seconds" text,
	"equipment" text,
	"side" "side",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rehab_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_pl" text NOT NULL,
	"name_en" text NOT NULL,
	"description" text,
	"target_body_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rehab_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"protocol_id" uuid,
	"completion_pct" smallint,
	"post_session_pain010" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rehab_sessions_sessionId_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "session_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"kind" "block_kind" NOT NULL,
	"duration_seconds" integer,
	"work_seconds" integer,
	"rest_seconds" integer,
	"target_rounds" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"type" "session_type" NOT NULL,
	"title" text,
	"location" text,
	"notes" text,
	"source" "session_source" DEFAULT 'MANUAL' NOT NULL,
	"ai_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"block_movement_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer,
	"weight_kg" double precision,
	"duration_seconds" integer,
	"distance_m" integer,
	"calories" integer,
	"rpe" smallint,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wearable_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"source" "import_source" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"records_inserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "weekly_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_md" text NOT NULL,
	"strength_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cardio_volume" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wellness_avg" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_comparisons" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_coach_links" ADD CONSTRAINT "athlete_coach_links_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_coach_links" ADD CONSTRAINT "athlete_coach_links_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_follows" ADD CONSTRAINT "athlete_follows_follower_athlete_id_athletes_id_fk" FOREIGN KEY ("follower_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_follows" ADD CONSTRAINT "athlete_follows_followed_athlete_id_athletes_id_fk" FOREIGN KEY ("followed_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_public_profiles" ADD CONSTRAINT "athlete_public_profiles_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_movements" ADD CONSTRAINT "block_movements_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_movements" ADD CONSTRAINT "block_movements_block_id_session_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."session_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_movements" ADD CONSTRAINT "block_movements_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardio_segments" ADD CONSTRAINT "cardio_segments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardio_segments" ADD CONSTRAINT "cardio_segments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_progression_rule_id_progression_rules_id_fk" FOREIGN KEY ("progression_rule_id") REFERENCES "public"."progression_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_events" ADD CONSTRAINT "injury_events_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_events" ADD CONSTRAINT "injury_events_injury_id_injuries_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injuries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_injury_id_injuries_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injuries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_checkins" ADD CONSTRAINT "pain_checkins_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_athlete_id_athletes_id_fk" FOREIGN KEY ("referrer_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_athlete_id_athletes_id_fk" FOREIGN KEY ("referred_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehab_protocol_exercises" ADD CONSTRAINT "rehab_protocol_exercises_protocol_id_rehab_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."rehab_protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehab_sessions" ADD CONSTRAINT "rehab_sessions_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehab_sessions" ADD CONSTRAINT "rehab_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehab_sessions" ADD CONSTRAINT "rehab_sessions_protocol_id_rehab_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."rehab_protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_block_movement_id_block_movements_id_fk" FOREIGN KEY ("block_movement_id") REFERENCES "public"."block_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearable_syncs" ADD CONSTRAINT "wearable_syncs_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_templates" ADD CONSTRAINT "weekly_templates_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_athlete_created_idx" ON "ai_usage" USING btree ("athlete_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_model_idx" ON "ai_usage" USING btree ("model");--> statement-breakpoint
CREATE INDEX "ai_usage_request_idx" ON "ai_usage" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "athlete_coach_links_athlete_idx" ON "athlete_coach_links" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_coach_links_coach_idx" ON "athlete_coach_links" USING btree ("coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_follows_unique_idx" ON "athlete_follows" USING btree ("follower_athlete_id","followed_athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_follows_follower_idx" ON "athlete_follows" USING btree ("follower_athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_follows_followed_idx" ON "athlete_follows" USING btree ("followed_athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_public_profiles_slug_idx" ON "athlete_public_profiles" USING btree ("public_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_user_idx" ON "athletes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_username_idx" ON "athletes" USING btree ("username");--> statement-breakpoint
CREATE INDEX "audit_log_athlete_occurred_idx" ON "audit_log" USING btree ("athlete_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "block_movements_block_idx" ON "block_movements" USING btree ("block_id","order_index");--> statement-breakpoint
CREATE INDEX "block_movements_exercise_idx" ON "block_movements" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "block_movements_athlete_exercise_idx" ON "block_movements" USING btree ("athlete_id","exercise_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cardio_segments_session_idx" ON "cardio_segments" USING btree ("session_id","order_index");--> statement-breakpoint
CREATE INDEX "cardio_segments_athlete_created_idx" ON "cardio_segments" USING btree ("athlete_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "coaches_user_idx" ON "coaches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consents_athlete_type_idx" ON "consents" USING btree ("athlete_id","consent_type");--> statement-breakpoint
CREATE INDEX "daily_metrics_athlete_day_idx" ON "daily_metrics" USING btree ("athlete_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_export_requests_athlete_idx" ON "data_export_requests" USING btree ("athlete_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_slug_idx" ON "exercises" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "exercises_category_idx" ON "exercises" USING btree ("category");--> statement-breakpoint
CREATE INDEX "goal_progress_goal_recorded_idx" ON "goal_progress" USING btree ("goal_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goal_progress_athlete_recorded_idx" ON "goal_progress" USING btree ("athlete_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goals_athlete_type_idx" ON "goals" USING btree ("athlete_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "hyrox_stations_slug_idx" ON "hyrox_stations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "injuries_athlete_idx" ON "injuries" USING btree ("athlete_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "injury_events_injury_idx" ON "injury_events" USING btree ("injury_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "injury_events_athlete_occurred_idx" ON "injury_events" USING btree ("athlete_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "journal_entries_athlete_recorded_idx" ON "journal_entries" USING btree ("athlete_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "medications_injury_idx" ON "medications" USING btree ("injury_id");--> statement-breakpoint
CREATE INDEX "medications_athlete_idx" ON "medications" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "pain_checkins_athlete_recorded_idx" ON "pain_checkins" USING btree ("athlete_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "race_results_athlete_date_idx" ON "race_results" USING btree ("athlete_id","event_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_athlete_id");--> statement-breakpoint
CREATE INDEX "referrals_email_idx" ON "referrals" USING btree ("referred_email");--> statement-breakpoint
CREATE INDEX "rehab_protocol_exercises_protocol_idx" ON "rehab_protocol_exercises" USING btree ("protocol_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "rehab_protocols_slug_idx" ON "rehab_protocols" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "rehab_sessions_protocol_idx" ON "rehab_sessions" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "rehab_sessions_athlete_idx" ON "rehab_sessions" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "session_blocks_session_idx" ON "session_blocks" USING btree ("session_id","order_index");--> statement-breakpoint
CREATE INDEX "session_blocks_athlete_created_idx" ON "session_blocks" USING btree ("athlete_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_athlete_date_idx" ON "sessions" USING btree ("athlete_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_athlete_type_idx" ON "sessions" USING btree ("athlete_id","type");--> statement-breakpoint
CREATE INDEX "sets_movement_idx" ON "sets" USING btree ("block_movement_id","set_number");--> statement-breakpoint
CREATE INDEX "sets_athlete_created_idx" ON "sets" USING btree ("athlete_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "wearable_syncs_athlete_started_idx" ON "wearable_syncs" USING btree ("athlete_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_summaries_athlete_week_idx" ON "weekly_summaries" USING btree ("athlete_id","iso_year","iso_week");--> statement-breakpoint
CREATE INDEX "weekly_templates_athlete_idx" ON "weekly_templates" USING btree ("athlete_id");