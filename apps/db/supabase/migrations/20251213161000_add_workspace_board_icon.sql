-- Add optional icon identifier to boards
-- Stores an icon key (e.g., 'Rocket', 'Calendar') for UI rendering.
ALTER TABLE public.workspace_boards
ADD COLUMN IF NOT EXISTS icon TEXT;

-- Keep values reasonable (avoid huge strings); icon keys are short.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_boards_icon_length_check'
  ) THEN
    ALTER TABLE public.workspace_boards
    ADD CONSTRAINT workspace_boards_icon_length_check
    CHECK (icon IS NULL OR char_length(icon) <= 64);
  END IF;
END $$;


