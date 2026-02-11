-- Add time_format preference to users table
-- Values: 'auto' (detect from locale), '12h', '24h'
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS time_format TEXT DEFAULT 'auto'
CHECK (time_format IN ('auto', '12h', '24h'));

-- Add comment for documentation
COMMENT ON COLUMN public.users.time_format IS 'User preference for time display format: auto (detect from locale), 12h (AM/PM), or 24h (military time)';
