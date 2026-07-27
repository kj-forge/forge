-- Follow-up to 0019: archived chin-up copies that were never referenced
-- (no logged sets, no plan stations, no goals) vanish for good; copies with
-- history stay archived so old sessions remain readable.
DELETE FROM exercises e
WHERE e.slug = 'chin-up'
  AND e.athlete_id IS NOT NULL
  AND e.is_archived = true
  AND NOT EXISTS (SELECT 1 FROM block_movements bm WHERE bm.exercise_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM training_plan_unit_step_exercises tpse WHERE tpse.exercise_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.exercise_id = e.id);
