begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(9);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.nova_sessions'::regclass
      and tgname = 'check_challenge_attempt_limits'
      and not tgisinternal
  ),
  'private Nova session inserts retain the attempt-limit trigger'
);

select ok(
  pg_get_functiondef('public.check_challenge_attempt_limits()'::regprocedure)
    ilike '%for no key update%',
  'the attempt-limit trigger serializes starts on the challenge row'
);

set local role service_role;

insert into private.nova_challenges (
  id,
  title,
  description,
  duration,
  max_attempts,
  max_daily_attempts
) values (
  '10000000-0000-0000-0000-000000000941',
  'pgTAP total session limit',
  'Attempt count regression fixture',
  3600,
  1,
  5
);

insert into private.nova_sessions (
  id,
  user_id,
  challenge_id,
  status,
  start_time,
  end_time
) values (
  '10000000-0000-0000-0000-000000000942',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000941',
  'IN_PROGRESS',
  now(),
  null
);

select throws_ok(
  $$
    insert into private.nova_sessions (
      user_id, challenge_id, status, start_time, end_time
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000941',
      'IN_PROGRESS', now(), null
    )
  $$,
  'P0001',
  'You have exceeded the maximum number of total attempts for this challenge.',
  'the total attempt limit rejects a second session'
);

insert into private.nova_challenges (
  id,
  title,
  description,
  duration,
  max_attempts,
  max_daily_attempts
) values (
  '10000000-0000-0000-0000-000000000943',
  'pgTAP daily session limit',
  'Daily attempt count regression fixture',
  3600,
  5,
  1
);

insert into private.nova_sessions (
  id,
  user_id,
  challenge_id,
  status,
  start_time,
  end_time
) values (
  '10000000-0000-0000-0000-000000000944',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000943',
  'IN_PROGRESS',
  now(),
  null
);

select throws_ok(
  $$
    insert into private.nova_sessions (
      user_id, challenge_id, status, start_time, end_time
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000943',
      'IN_PROGRESS', now(), null
    )
  $$,
  'P0001',
  'You have exceeded the daily attempt limit for this challenge.',
  'the daily attempt limit rejects a second session'
);

insert into private.nova_challenges (
  id, title, description, duration, max_attempts, max_daily_attempts
) values (
  '10000000-0000-0000-0000-000000000945',
  'pgTAP active session guard', 'Active session regression fixture', 3600, 10, 10
);

insert into private.nova_sessions (user_id, challenge_id, status, start_time)
values (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000945', 'IN_PROGRESS', now()
);

select throws_ok(
  $$insert into private.nova_sessions (user_id, challenge_id, status, start_time)
    values ('00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000945', 'IN_PROGRESS', now())$$,
  '23505', 'An active challenge session already exists',
  'the database rejects another active start even below attempt limits'
);

update private.nova_sessions set start_time = now() - interval '1 hour'
where challenge_id = '10000000-0000-0000-0000-000000000945';

select lives_ok(
  $$insert into private.nova_sessions (user_id, challenge_id, status, start_time)
    values ('00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000945', 'IN_PROGRESS', now())$$,
  'an expired IN_PROGRESS row does not prevent a fresh start'
);

select is(
  (select count(*) from private.nova_sessions
    where challenge_id = '10000000-0000-0000-0000-000000000945'),
  2::bigint,
  'expired attempts remain in history'
);

update private.nova_challenges set close_at = now()
where id = '10000000-0000-0000-0000-000000000945';

select lives_ok(
  $$insert into private.nova_sessions (user_id, challenge_id, status, start_time)
    values ('00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000945', 'IN_PROGRESS', now())$$,
  'a session at its close-time boundary is expired for the duplicate guard'
);

-- Put two instants on the same UTC day but different local dates.
select set_config('TimeZone',
  case when extract(hour from now() at time zone 'UTC') < 12
    then 'Etc/GMT+12' else 'Etc/GMT-14' end, true);

insert into private.nova_challenges (
  id, title, description, duration, max_attempts, max_daily_attempts
) values (
  '10000000-0000-0000-0000-000000000946',
  'pgTAP UTC daily limit', 'Non-UTC database regression fixture', 3600, 10, 1
);

insert into private.nova_sessions (user_id, challenge_id, status, start_time, created_at)
values (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000946', 'ENDED', now(),
  (date_trunc('day', now() at time zone 'UTC') +
    case when extract(hour from now() at time zone 'UTC') < 12
      then interval '23 hours 59 minutes' else interval '1 second' end) at time zone 'UTC'
);

select throws_ok(
  $$insert into private.nova_sessions (user_id, challenge_id, status, start_time)
    values ('00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000946', 'IN_PROGRESS', now())$$,
  'P0001', 'You have exceeded the daily attempt limit for this challenge.',
  'the daily limit counts UTC dates independently of the database timezone'
);

reset role;

select * from finish();

rollback;
