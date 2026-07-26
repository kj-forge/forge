-- Custom SQL migration file, put your code below! --
DELETE FROM exercises WHERE athlete_id IS NULL AND slug = 'chin-up';
UPDATE exercises SET is_archived = true WHERE athlete_id IS NOT NULL AND slug = 'chin-up';
