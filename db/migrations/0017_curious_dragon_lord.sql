CREATE TYPE "public"."segment_kind" AS ENUM('STATION', 'ROX_ZONE', 'REST');--> statement-breakpoint
CREATE TABLE "session_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"order_index" integer NOT NULL,
	"kind" "segment_kind" NOT NULL,
	"block_movement_id" uuid,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_segments" ADD CONSTRAINT "session_segments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_segments" ADD CONSTRAINT "session_segments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_segments" ADD CONSTRAINT "session_segments_block_id_session_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."session_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_segments" ADD CONSTRAINT "session_segments_block_movement_id_block_movements_id_fk" FOREIGN KEY ("block_movement_id") REFERENCES "public"."block_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_segments_session_idx" ON "session_segments" USING btree ("session_id","block_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "session_segments_block_round_order_uq" ON "session_segments" USING btree ("block_id","round_number","order_index");