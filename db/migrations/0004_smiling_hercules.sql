-- Remove existing duplicate (block_id, exercise_id) rows BEFORE the unique
-- index is created, otherwise CREATE UNIQUE INDEX fails. For each duplicate
-- group we keep the row with the most logged sets (then the earliest), so no
-- set data is lost — the double-add race produced empty duplicates.
DELETE FROM "block_movements"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT bm."id",
           ROW_NUMBER() OVER (
             PARTITION BY bm."block_id", bm."exercise_id"
             ORDER BY COALESCE(sc.cnt, 0) DESC, bm."created_at" ASC
           ) AS rn
    FROM "block_movements" bm
    LEFT JOIN (
      SELECT "block_movement_id", COUNT(*) AS cnt FROM "sets" GROUP BY "block_movement_id"
    ) sc ON sc."block_movement_id" = bm."id"
  ) ranked
  WHERE ranked.rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "block_movements_block_exercise_uq" ON "block_movements" USING btree ("block_id","exercise_id");
