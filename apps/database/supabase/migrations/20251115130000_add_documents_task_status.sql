-- Add 'documents' status to task_board_status enum
-- This enables a new list type for reference materials and documentation
-- Documents lists will not show task checkboxes (no completion tracking)

-- Add the new enum value
ALTER TYPE task_board_status ADD VALUE IF NOT EXISTS 'documents';

-- Add comment explaining the new status type
COMMENT ON TYPE task_board_status IS 'Task list status types: not_started (Backlog), active (Active), done (Done), closed (Closed), documents (Reference materials without completion tracking)';
