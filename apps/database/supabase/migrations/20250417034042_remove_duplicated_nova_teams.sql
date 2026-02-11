-- Identify duplicate team names by creating a temporary table
CREATE TEMP TABLE duplicate_nova_teams AS
SELECT name
FROM public.nova_teams
WHERE name IS NOT NULL
GROUP BY name
HAVING COUNT(*) > 1;

-- For each duplicate team name, keep only the most recently created record
WITH ranked_teams AS (
  SELECT 
    id,
    name,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) AS row_num
  FROM public.nova_teams
  WHERE name IN (SELECT name FROM duplicate_nova_teams)
)
DELETE FROM public.nova_teams
WHERE id IN (
  SELECT id 
  FROM ranked_teams 
  WHERE row_num > 1
);

-- Remove any NULL team names
DELETE FROM public.nova_teams WHERE name IS NULL;

-- Add a unique constraint to the name column
ALTER TABLE public.nova_teams 
  ALTER COLUMN name SET NOT NULL,
  ADD CONSTRAINT nova_teams_name_unique UNIQUE (name);

-- Drop the temporary table
DROP TABLE duplicate_nova_teams;