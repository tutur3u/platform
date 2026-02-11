-- Add ticket identifier system to tasks
-- This enables board-level sequential ticket numbering (e.g., DEV-1, DEV-2)

-- 1. Add ticket_prefix and next_task_number columns to workspace_boards
-- ticket_prefix: Custom prefix for task identifiers (e.g., "DEV", "BUG", "SPRINT")
-- next_task_number: Persistent counter that never resets, even if all tasks are deleted
ALTER TABLE workspace_boards
ADD COLUMN ticket_prefix TEXT,
ADD COLUMN next_task_number INTEGER NOT NULL DEFAULT 1;

-- 2. Add display_number column to tasks
-- This is the sequential number within a board
ALTER TABLE tasks
ADD COLUMN display_number INTEGER;

-- 3. Add board_id to tasks for easier indexing (denormalized from task_lists)
-- This will be populated via trigger
ALTER TABLE tasks
ADD COLUMN board_id UUID;

-- 4. Create function to get next display number for a board
-- This atomically increments the board's counter, ensuring numbers never repeat
CREATE OR REPLACE FUNCTION get_next_task_display_number(p_board_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Atomically increment and return the next task number for this board
  -- This ensures the counter never resets, even if all tasks are deleted
  UPDATE workspace_boards
  SET next_task_number = next_task_number + 1
  WHERE id = p_board_id
  RETURNING next_task_number - 1 INTO next_number;

  RETURN next_number;
END;
$$;

-- 5. Create trigger function to auto-assign display_number and board_id
-- This ensures board_id stays synchronized with list_id on both INSERT and UPDATE
CREATE OR REPLACE FUNCTION assign_task_display_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_board_id UUID;
  v_old_board_id UUID;
BEGIN
  -- Get the board_id for this task's list
  SELECT tl.board_id INTO v_board_id
  FROM task_lists tl
  WHERE tl.id = NEW.list_id;

  -- Store old board_id for UPDATE operations
  IF TG_OP = 'UPDATE' THEN
    v_old_board_id := OLD.board_id;
  END IF;

  -- Always set board_id to match the list's board (keeps it synchronized)
  NEW.board_id := v_board_id;

  -- Only assign display_number if not already set
  IF NEW.display_number IS NULL THEN
    NEW.display_number := get_next_task_display_number(v_board_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Create trigger to auto-assign display_number on insert and update
-- Fires on both operations to keep board_id synchronized with list_id
CREATE TRIGGER trigger_assign_task_display_number
  BEFORE INSERT OR UPDATE OF list_id ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION assign_task_display_number();

-- 7. Backfill existing tasks with board_id and display numbers
-- Group by board and assign sequential numbers based on creation date
DO $$
DECLARE
  board_record RECORD;
  task_record RECORD;
  current_number INTEGER;
BEGIN
  -- First, populate board_id for all existing tasks
  UPDATE tasks t
  SET board_id = tl.board_id
  FROM task_lists tl
  WHERE t.list_id = tl.id
    AND t.board_id IS NULL;

  -- For each board, assign display numbers
  FOR board_record IN
    SELECT DISTINCT board_id
    FROM tasks
    WHERE deleted_at IS NULL
      AND display_number IS NULL
      AND board_id IS NOT NULL
  LOOP
    current_number := 1;

    -- For each task in this board (ordered by creation date)
    FOR task_record IN
      SELECT id
      FROM tasks
      WHERE board_id = board_record.board_id
        AND deleted_at IS NULL
        AND display_number IS NULL
      ORDER BY created_at, id
    LOOP
      -- Update the task with the current number
      UPDATE tasks
      SET display_number = current_number
      WHERE id = task_record.id;

      current_number := current_number + 1;
    END LOOP;
  END LOOP;

  -- After backfill, update each board's next_task_number to max + 1
  -- This ensures the counter starts after existing tasks
  UPDATE workspace_boards wb
  SET next_task_number = COALESCE(
    (SELECT MAX(t.display_number) + 1
     FROM tasks t
     WHERE t.board_id = wb.id
       AND t.deleted_at IS NULL),
    1
  );
END;
$$;

ALTER TABLE tasks
ADD CONSTRAINT fk_tasks_board_id
FOREIGN KEY (board_id) REFERENCES workspace_boards(id) ON DELETE CASCADE;

-- 10. Create unique index to ensure display_number is unique per board
CREATE UNIQUE INDEX idx_tasks_board_display_number
ON tasks (board_id, display_number)
WHERE deleted_at IS NULL;

-- 11. Set default ticket_prefix for existing boards based on board name
-- Generate a 2-4 character prefix from the board name (uppercase initials)
UPDATE workspace_boards
SET ticket_prefix = (
  CASE
    -- Try to get initials from words (e.g., "Bug Tracker" -> "BT")
    WHEN name ~* '\s' THEN
      UPPER(SUBSTRING(regexp_replace(name, '[^A-Za-z\s]', '', 'g') FROM '^(\S)\S*\s(\S)'))
    -- For single words, take first 3 chars (e.g., "Development" -> "DEV")
    ELSE
      UPPER(SUBSTRING(regexp_replace(name, '[^A-Za-z]', '', 'g') FROM 1 FOR 3))
  END
)
WHERE ticket_prefix IS NULL;

-- 12. Add comments explaining the system
COMMENT ON COLUMN workspace_boards.ticket_prefix IS 'Custom prefix for task ticket identifiers (e.g., "DEV", "BUG"). Combined with display_number to form ticket ID like "DEV-42".';
COMMENT ON COLUMN workspace_boards.next_task_number IS 'Persistent counter for the next task number. Never resets, even if all tasks are deleted. Atomically incremented by trigger.';
COMMENT ON COLUMN tasks.display_number IS 'Sequential number within the board. Combined with board ticket_prefix to form human-readable ticket identifier.';
COMMENT ON COLUMN tasks.board_id IS 'Denormalized board_id from task_lists for efficient indexing and querying. Automatically maintained by trigger.';
