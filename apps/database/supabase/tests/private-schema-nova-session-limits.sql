begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(4);

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
    ilike '%for update%',
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

reset role;

select * from finish();

rollback;
