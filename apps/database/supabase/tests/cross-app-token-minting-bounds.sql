begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(36);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-0000000c1a50'),
  ('00000000-0000-0000-0000-0000000c1a51')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '00000000-0000-0000-0000-0000000c1a5e',
  'Cross-app bounds non-root workspace',
  '00000000-0000-0000-0000-0000000c1a50',
  false
)
on conflict (id) do nothing;

-- Registered external apps live in the root workspace secrets only.
insert into public.workspace_secrets (ws_id, name, value)
values
  (
    '00000000-0000-0000-0000-0000000c1a5e',
    'EXTERNAL_APP_REGISTRY:rogue-app:displayName',
    'Registered outside the root workspace'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'EXTERNAL_APP_REGISTRY:acme-crm:displayName',
    'Acme CRM'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'EXTERNAL_APP_REGISTRY:paused-app:displayName',
    'Paused'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'EXTERNAL_APP_REGISTRY:paused-app:enabled',
    'false'
  );

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
    'private.assert_cross_app_token_apps(text,text)',
    'execute'
  ),
  'authenticated cannot call the app allowlist helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.revoke_overlong_cross_app_tokens()',
    'execute'
  ),
  'authenticated cannot run the containment function'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.revoke_overlong_cross_app_tokens()',
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

-- Each mint uses a distinct target so its row can be found below.
select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50'::uuid,
  'web'::text,
  'mail'::text,
  2147483647::integer
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'web',
  'meet',
  315360000,
  '{"email":null}'::jsonb
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'web',
  'calendar',
  30,
  null::jsonb
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50'::uuid,
  'nova'::text,
  'chat'::text
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'cli',
  'platform',
  86400,
  null::jsonb
);

select public.generate_cross_app_token(
  '00000000-0000-0000-0000-0000000c1a50',
  'cli',
  'tasks',
  120,
  null::jsonb
);

select lives_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      'acme-crm',
      60,
      null::jsonb
    )
  $$,
  'a registered, enabled external app is a valid target'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      'paused-app',
      60,
      null::jsonb
    )
  $$,
  '22023',
  'Unknown cross-app token target',
  'a disabled external app is not a valid target'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      'rogue-app',
      60,
      null::jsonb
    )
  $$,
  '22023',
  'Unknown cross-app token target',
  'a registry row outside the root workspace does not register an app'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      'attacker-app',
      60,
      null::jsonb
    )
  $$,
  '22023',
  'Unknown cross-app token target',
  'an unregistered target is rejected'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50'::uuid,
      'web'::text,
      'acme-crm:displayName'::text,
      60::integer
    )
  $$,
  '22023',
  'Unknown cross-app token target',
  'a target cannot smuggle a registry key suffix'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'web',
      null::text,
      60,
      null::jsonb
    )
  $$,
  '22023',
  'Unknown cross-app token target',
  'a null target is rejected'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-0000000c1a50',
      'evil',
      'platform',
      60,
      null::jsonb
    )
  $$,
  '22023',
  'Unknown cross-app token origin',
  'an unknown origin is rejected'
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
  'the caller binding still applies first'
);

reset role;

-- now() is fixed for the whole transaction, so lifetimes are exact.
select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
      and target_app = 'mail'
  ),
  interval '60 seconds',
  'a huge web expiry on the legacy overload is clamped to 60 s'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
      and target_app = 'meet'
  ),
  interval '60 seconds',
  'a ten-year web expiry on the session-data overload is clamped to 60 s'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
      and target_app = 'calendar'
  ),
  interval '30 seconds',
  'a web expiry under the limit is kept'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
      and target_app = 'chat'
  ),
  interval '60 seconds',
  'the legacy 300 s default is clamped to 60 s for a satellite origin'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
      and target_app = 'platform'
  ),
  interval '300 seconds',
  'a one-day cli expiry is clamped to 300 s'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a50'
      and target_app = 'tasks'
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
  7,
  'only the seven valid requests inserted rows'
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
    'containment-unused-301s',
    now() + interval '301 seconds',
    null,
    false,
    'cli',
    'platform'
  ),
  (
    '00000000-0000-0000-0000-0000000c1a51',
    'containment-revoked-years',
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
  );

-- The read-only audit handed to production operators, verbatim.
select lives_ok(
  $$
    select
      case
        when origin_app in ('web', 'cli') then origin_app
        when origin_app in (
          'ai', 'apps', 'calendar', 'chat', 'cms', 'colab', 'contacts', 'docs',
          'drive', 'finance', 'forms', 'git', 'hive', 'infra', 'inventory', 'learn',
          'lettin', 'mail', 'meet', 'mind', 'mira', 'nova', 'parley', 'pay',
          'platform', 'qr', 'rewise', 'storefront', 'tanstack-web', 'tasks', 'teach',
          'tools', 'track'
        ) then 'internal'
        else 'other'
      end as origin_bucket,
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
      count(*) filter (where is_revoked) as revoked,
      count(*) filter (where used_at is not null) as redeemed,
      count(*) filter (
        where used_at - created_at > interval '300 seconds'
      ) as redeemed_after_300s
    from private.cross_app_tokens
    group by 1, 2
    order by 1, 2
  $$,
  'query 1 (minted lifetime) of the audit parses and runs'
);

select lives_ok(
  $$
    select
      case
        when origin_app in ('web', 'cli') then origin_app
        when origin_app in (
          'ai', 'apps', 'calendar', 'chat', 'cms', 'colab', 'contacts', 'docs',
          'drive', 'finance', 'forms', 'git', 'hive', 'infra', 'inventory', 'learn',
          'lettin', 'mail', 'meet', 'mind', 'mira', 'nova', 'parley', 'pay',
          'platform', 'qr', 'rewise', 'storefront', 'tanstack-web', 'tasks', 'teach',
          'tools', 'track'
        ) then 'internal'
        else 'other'
      end as origin_bucket,
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
  'query 2 (redemption delay) of the audit parses and runs'
);

select lives_ok(
  $$
    select
      case
        when origin_app in ('web', 'cli') then origin_app
        when origin_app in (
          'ai', 'apps', 'calendar', 'chat', 'cms', 'colab', 'contacts', 'docs',
          'drive', 'finance', 'forms', 'git', 'hive', 'infra', 'inventory', 'learn',
          'lettin', 'mail', 'meet', 'mind', 'mira', 'nova', 'parley', 'pay',
          'platform', 'qr', 'rewise', 'storefront', 'tanstack-web', 'tasks', 'teach',
          'tools', 'track'
        ) then 'internal'
        else 'other'
      end as origin_bucket,
      count(*) filter (where not is_revoked) as live_over_limit,
      count(*) filter (where is_revoked) as revoked_over_limit
    from private.cross_app_tokens
    where used_at is null
      and expires_at > now() + interval '300 seconds'
    group by 1
    order by 1
  $$,
  'query 3 (over-limit) of the audit parses and runs'
);

select is(
  (
    select count(*)::integer
    from private.cross_app_tokens
    where used_at is null
      and not is_revoked
      and expires_at > now() + interval '300 seconds'
  ),
  2,
  'before containment, two unused unrevoked tokens are over the limit'
);

select set_config(
  'cross_app_bounds.rows_before_containment',
  (select count(*)::text from private.cross_app_tokens),
  true
);

select is(
  private.revoke_overlong_cross_app_tokens(),
  2,
  'containment revokes exactly the two unused, unrevoked over-limit rows'
);

select is(
  (
    select array_agg(token order by token)
    from private.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-0000000c1a51'
      and is_revoked
  ),
  array[
    'containment-revoked-years',
    'containment-unused-301s',
    'containment-unused-day'
  ],
  'revoked rows are the over-limit unused ones (one was already revoked)'
);

select is(
  (
    select expires_at - now()
    from private.cross_app_tokens
    where token = 'containment-unused-day'
  ),
  interval '1 day',
  'containment leaves expires_at unchanged as audit evidence'
);

select is(
  (
    select is_revoked
    from private.cross_app_tokens
    where token = 'containment-used-day'
  ),
  false,
  'a used token is not touched'
);

select is(
  (
    select is_revoked
    from private.cross_app_tokens
    where token = 'containment-unused-200s'
  ),
  false,
  'an unused token within 300 s is not touched'
);

select is(
  (select count(*)::text from private.cross_app_tokens),
  current_setting('cross_app_bounds.rows_before_containment'),
  'containment deletes nothing'
);

select is(
  (
    select v.user_id
    from public.validate_cross_app_token_with_session(
      'containment-unused-day',
      'platform'
    ) v
  ),
  null::uuid,
  'a contained token can no longer be redeemed through the session validator'
);

select is(
  (
    select v.user_id
    from public.validate_cross_app_token_with_session(
      (
        select token
        from private.cross_app_tokens
        where user_id = '00000000-0000-0000-0000-0000000c1a50'
          and target_app = 'calendar'
      ),
      'calendar'
    ) v
    -- The validator also emits a trailing (null, null) row after a hit.
    where v.user_id is not null
  ),
  '00000000-0000-0000-0000-0000000c1a50'::uuid,
  'a clamped, unrevoked token is still redeemable once (control)'
);

select is(
  private.revoke_overlong_cross_app_tokens(),
  0,
  'containment is idempotent'
);

select * from finish();

rollback;
