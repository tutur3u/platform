begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(25);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-0000000c1a50'),
  ('00000000-0000-0000-0000-0000000c1a51')
on conflict (id) do nothing;

select ok(
  not has_function_privilege(
    'authenticated',
    'private.cross_app_token_lifetime_seconds(text,integer)',
    'execute'
  ),
  'authenticated cannot call the lifetime helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.expire_overlong_cross_app_tokens()',
    'execute'
  ),
  'authenticated cannot run the containment function'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.expire_overlong_cross_app_tokens()',
    'execute'
  ),
  'anon cannot run the containment function'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'execute'
  ),
  'authenticated keeps execute on the session-data generator'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000c1a50',
    'role', 'authenticated'
  )::text,
  true
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50'::uuid,
  'web'::text,
  'clamp-web-huge-legacy'::text,
  2147483647::integer
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'web',
  'clamp-web-huge-session',
  315360000,
  '{"email":null}'::jsonb
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'web',
  'clamp-web-short',
  30,
  null::jsonb
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50'::uuid,
  'nova'::text,
  'clamp-satellite-default'::text
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'cli',
  'clamp-cli-huge',
  86400,
  null::jsonb
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'cli',
  'clamp-cli-short',
  120,
  null::jsonb
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      'platform',
      0,
      null::jsonb
    )
  $$,
  '22023',
  'Cross-app token expiry must be at least 1 second',
  'a zero expiry is rejected'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50'::uuid,
      'cli'::text,
      'platform'::text,
      -5::integer
    )
  $$,
  '22023',
  'Cross-app token expiry must be at least 1 second',
  'a negative expiry is rejected'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      'platform',
      null::integer,
      null::jsonb
    )
  $$,
  '22023',
  'Cross-app token expiry must be at least 1 second',
  'a null expiry is rejected'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a51',
      'cli',
      'platform',
      300,
      null::jsonb
    )
  $$,
  '42501',
  'Cannot generate cross-app token for another user',
  'the caller binding still applies'
);

reset role;

-- now() is fixed for the whole transaction, so lifetimes are exact.
select is(
  (
    select t.expires_at - now()
    from private.cross_app_tokens t
    where t.target_app = 'clamp-web-huge-legacy'
  ),
  interval '60 seconds',
  'a huge web expiry on the legacy overload is clamped to 60 s'
);

select is(
  (
    select t.expires_at - now()
    from private.cross_app_tokens t
    where t.target_app = 'clamp-web-huge-session'
  ),
  interval '60 seconds',
  'a ten-year web expiry on the session-data overload is clamped to 60 s'
);

select is(
  (
    select t.expires_at - now()
    from private.cross_app_tokens t
    where t.target_app = 'clamp-web-short'
  ),
  interval '30 seconds',
  'a web expiry under the limit is kept'
);

select is(
  (
    select t.expires_at - now()
    from private.cross_app_tokens t
    where t.target_app = 'clamp-satellite-default'
  ),
  interval '60 seconds',
  'the legacy 300 s default is clamped to 60 s for a non-cli origin'
);

select is(
  (
    select t.expires_at - now()
    from private.cross_app_tokens t
    where t.target_app = 'clamp-cli-huge'
  ),
  interval '300 seconds',
  'a one-day cli expiry is clamped to 300 s'
);

select is(
  (
    select t.expires_at - now()
    from private.cross_app_tokens t
    where t.target_app = 'clamp-cli-short'
  ),
  interval '120 seconds',
  'a cli expiry under the limit is kept'
);

select is(
  (
    select count(*)::integer
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
  ),
  6,
  'only the six valid requests inserted rows'
);

-- Containment: rows minted before this migration with overlong lifetimes.
insert into private.cross_app_tokens (
  user_id,
  token,
  expires_at,
  used_at,
  is_revoked,
  origin_app,
  target_app
) values
  (
    '00000000-0000-0000-0000-0000000c1a51',
    'containment-unused-day',
    now() + interval '1 day',
    null,
    false,
    'web',
    'platform'
  ),
  (
    '00000000-0000-0000-0000-0000000c1a51',
    'containment-unused-years',
    now() + interval '10 years',
    null,
    true,
    'web',
    'nova'
  ),
  (
    '00000000-0000-0000-0000-0000000c1a51',
    'containment-used-day',
    now() + interval '1 day',
    now(),
    false,
    'web',
    'platform'
  ),
  (
    '00000000-0000-0000-0000-0000000c1a51',
    'containment-unused-200s',
    now() + interval '200 seconds',
    null,
    false,
    'web',
    'platform'
  ),
  (
    '00000000-0000-0000-0000-0000000c1a51',
    'containment-unused-301s',
    now() + interval '301 seconds',
    null,
    false,
    'cli',
    'platform'
  );

-- Read-only lifetime audit (the same SELECT handed to production operators).
select lives_ok(
  $$
    select
      origin_app,
      case
        when expires_at - created_at <= interval '60 seconds' then '1 <=60s'
        when expires_at - created_at <= interval '300 seconds' then '2 61-300s'
        when expires_at - created_at <= interval '1 hour' then '3 301s-1h'
        when expires_at - created_at <= interval '1 day' then '4 1h-1d'
        when expires_at - created_at <= interval '30 days' then '5 1d-30d'
        else '6 >30d'
      end as minted_lifetime,
      count(*) as tokens,
      count(*) filter (
        where used_at is null and not is_revoked and expires_at > now()
      ) as live_unused,
      count(*) filter (where used_at is not null) as redeemed,
      count(*) filter (
        where used_at - created_at > interval '300 seconds'
      ) as redeemed_after_300s
    from private.cross_app_tokens
    group by 1, 2
    order by 1, 2
  $$,
  'the minted-lifetime audit parses and runs'
);

select lives_ok(
  $$
    select
      origin_app,
      case
        when used_at - created_at <= interval '60 seconds' then '1 <=60s'
        when used_at - created_at <= interval '300 seconds' then '2 61-300s'
        when used_at - created_at <= interval '1 hour' then '3 301s-1h'
        when used_at - created_at <= interval '1 day' then '4 1h-1d'
        else '5 >1d'
      end as redemption_delay,
      count(*) as redeemed_tokens
    from private.cross_app_tokens
    where used_at is not null
    group by 1, 2
    order by 1, 2
  $$,
  'the redemption-delay audit parses and runs'
);

select lives_ok(
  $$
    select
      origin_app,
      count(*) as would_expire,
      count(*) filter (where is_revoked) as already_revoked
    from private.cross_app_tokens
    where used_at is null
      and expires_at > now() + interval '300 seconds'
    group by 1
    order by 1
  $$,
  'the containment preview audit parses and runs'
);

select is(
  (
    select sum(would_expire)::integer
    from (
      select origin_app, count(*) as would_expire
      from private.cross_app_tokens
      where used_at is null
        and expires_at > now() + interval '300 seconds'
      group by 1
    ) preview
  ),
  3,
  'the containment preview counts the same rows the migration expires'
);

select is(
  private.expire_overlong_cross_app_tokens(),
  3,
  'containment expires exactly the three unused rows beyond now() + 300 s'
);

select is(
  (
    select array_agg(token order by token)
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a51'
      and expires_at = now()
  ),
  array[
    'containment-unused-301s',
    'containment-unused-day',
    'containment-unused-years'
  ],
  'the expired rows are the unused over-limit ones, revoked or not'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where token = 'containment-used-day'
  ),
  interval '1 day',
  'a used token is not touched'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where token = 'containment-unused-200s'
  ),
  interval '200 seconds',
  'an unused token within 300 s is not touched'
);

select is(
  (select count(*)::integer from private.cross_app_tokens),
  11,
  'containment deletes nothing'
);

select is(
  public.validate_cross_app_token('containment-unused-day', 'platform'),
  null::uuid,
  'a contained token can no longer be redeemed'
);

select * from finish();

rollback;
