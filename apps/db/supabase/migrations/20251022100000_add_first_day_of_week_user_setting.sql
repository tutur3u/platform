-- Add first_day_of_week column to user_private_details table
-- This allows users to set their preferred first day of the week (Sunday, Monday, or Saturday)

ALTER TABLE user_private_details
ADD COLUMN IF NOT EXISTS first_day_of_week TEXT DEFAULT 'monday' CHECK (first_day_of_week IN ('sunday', 'monday', 'saturday'));

-- Add comment to explain the column
COMMENT ON COLUMN user_private_details.first_day_of_week IS 'User preferred first day of the week for calendar displays (sunday, monday, or saturday)';
