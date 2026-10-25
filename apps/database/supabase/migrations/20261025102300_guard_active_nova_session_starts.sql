set local lock_timeout = '1s';

create or replace function public.check_challenge_attempt_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_attempts smallint;
  v_max_daily_attempts smallint;
  v_total_attempts bigint;
  v_daily_attempts bigint;
begin
  -- Serialize session inserts for this challenge before counting existing rows.
  perform 1
  from private.nova_challenges as challenge
  where challenge.id = new.challenge_id
  for no key update;

  if not found then
    raise exception 'Challenge does not exist';
  end if;

  select challenge.max_attempts, challenge.max_daily_attempts
  into v_max_attempts, v_max_daily_attempts
  from private.nova_challenges as challenge
  where challenge.id = new.challenge_id;

  select
    count(*),
    count(*) filter (
      where (session.created_at at time zone 'UTC')::date =
        (now() at time zone 'UTC')::date
    )
  into v_total_attempts, v_daily_attempts
  from private.nova_sessions as session
  where session.challenge_id = new.challenge_id
    and session.user_id = new.user_id;

  if v_total_attempts >= v_max_attempts then
    raise exception 'You have exceeded the maximum number of total attempts for this challenge.';
  end if;

  if v_daily_attempts >= v_max_daily_attempts then
    raise exception 'You have exceeded the daily attempt limit for this challenge.';
  end if;

  if new.status = 'IN_PROGRESS' and exists (
    select 1
    from private.nova_sessions as session
    join private.nova_challenges as challenge on challenge.id = session.challenge_id
    where session.challenge_id = new.challenge_id
      and session.user_id = new.user_id
      and session.status = 'IN_PROGRESS'
      and now() < least(
        session.start_time + challenge.duration * interval '1 second',
        coalesce(challenge.close_at, 'infinity'::timestamptz)
      )
  ) then
    raise unique_violation using message = 'An active challenge session already exists';
  end if;

  return new;
end;
$$;

revoke all on function public.check_challenge_attempt_limits()
  from public, anon, authenticated;
