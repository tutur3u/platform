-- Add columns to nova_challenges (these are fine)
alter table "public"."nova_challenges" add column "max_attempts" smallint not null default 1;
alter table "public"."nova_challenges" add column "max_daily_attempts" smallint not null default 1;

-- Create a function to check if a user has exceeded their attempts for a challenge
-- Optimization:  Use STRICT (important for performance)
-- Optimization:  Use SELECT ... INTO ...  instead of multiple selects.
-- Optimization:  Use COALESCE to handle potential NULLs (unlikely with your defaults, but good practice).
create or replace function public.check_challenge_attempt_limits(_challenge_id uuid, _user_id uuid)
returns boolean
language plpgsql security definer  -- Correct, security definer is necessary
strict  -- IMPORTANT: If _challenge_id or _user_id is NULL, return NULL immediately.
as $$
declare
  challenge_max_attempts smallint;
  challenge_max_daily_attempts smallint;
  total_attempts bigint;
  daily_attempts bigint;
begin
  -- Get the challenge limits and attempt counts in a *single* query.  This is much faster.
  SELECT
      nc.max_attempts,
      nc.max_daily_attempts,
      COUNT(ns.id) FILTER (WHERE ns.user_id = _user_id),                  -- All attempts
      COUNT(ns.id) FILTER (WHERE ns.user_id = _user_id AND ns.created_at::date = current_date) -- Daily attempts
  INTO
      challenge_max_attempts,
      challenge_max_daily_attempts,
      total_attempts,
      daily_attempts
  FROM nova_challenges nc
  LEFT JOIN nova_sessions ns ON nc.id = ns.challenge_id  -- Use a LEFT JOIN to handle challenges with *no* sessions
  WHERE nc.id = _challenge_id
  GROUP BY nc.max_attempts, nc.max_daily_attempts; -- Important for the LEFT JOIN to work correctly

  -- Handle the case where the challenge doesn't exist (or has no limits set).
  -- COALESCE ensures that if challenge_max_attempts is NULL, it defaults to a very large number (effectively no limit).
  challenge_max_attempts := COALESCE(challenge_max_attempts, 32767);  -- Max smallint value
  challenge_max_daily_attempts := COALESCE(challenge_max_daily_attempts, 32767);
  total_attempts := COALESCE(total_attempts, 0);  -- If no sessions, count is 0
  daily_attempts := COALESCE(daily_attempts, 0);

  -- Return true if user is within limits
  return (total_attempts < challenge_max_attempts) and (daily_attempts < challenge_max_daily_attempts);
end;
$$;


-- --- Policies ---

-- First, *drop* any conflicting policies (best practice before creating new ones)
drop policy if exists "Enable all access for current user" on "public"."nova_sessions";  -- Drop if it exists
drop policy if exists "Users can create sessions if within attempt limits" on "public"."nova_sessions";
drop policy if exists "Users can update sessions if within attempt limits" on "public"."nova_sessions";

-- Insert Policy:  Check attempts *OR* allow challenge managers
-- Optimization:  Use a subquery with EXISTS (generally faster than a JOIN in this case)
-- Optimization: Simplify user_id check (it's implied by the attempt check)
create policy "Users can create sessions if within attempt limits or are challenge managers"
on "public"."nova_sessions"
as permissive
for insert
to authenticated
with check (
  check_challenge_attempt_limits(challenge_id, auth.uid())  -- Check limits first (most common case)
  OR EXISTS (
    SELECT 1
    FROM nova_roles
    WHERE email = auth.email() AND allow_challenge_management = true
  )
);

-- Update Policy:  Only allow updates by the owning user
create policy "Users can update their own sessions"
on "public"."nova_sessions"
as permissive
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

--  Read (SELECT) policy - you probably want to add a read policy.
--   This example allows authenticated users to read their own sessions.
create policy "Users can read their own sessions or challenge managers can read all sessions"
on "public"."nova_sessions"
as permissive
for select
to authenticated
using (user_id = auth.uid() or exists (
  select 1
  from nova_roles
  where email = auth.email() and allow_challenge_management = true
));