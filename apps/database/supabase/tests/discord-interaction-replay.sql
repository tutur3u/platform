begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select has_table(
  'private',
  'discord_interaction_claims',
  'Discord interaction claims are stored privately'
);

select columns_are(
  'private',
  'discord_interaction_claims',
  array['interaction_id', 'interaction_type', 'claimed_at', 'expires_at'],
  'claim rows contain only the opaque id, type, and retention timestamps'
);

select has_pk(
  'private',
  'discord_interaction_claims',
  'interaction ids are uniquely claimable'
);

select has_index(
  'private',
  'discord_interaction_claims',
  'discord_interaction_claims_expires_at_idx',
  'expired claims have a cleanup index'
);

select ok(
  not exists (
    select 1
    from unnest(array['select', 'insert', 'update', 'delete']) privilege
    where has_table_privilege(
      'anon', 'private.discord_interaction_claims', privilege
    )
  ),
  'anon cannot read or mutate Discord interaction claims'
);

select ok(
  not exists (
    select 1
    from unnest(array['select', 'insert', 'update', 'delete']) privilege
    where has_table_privilege(
      'authenticated', 'private.discord_interaction_claims', privilege
    )
  ),
  'authenticated users cannot read or mutate Discord interaction claims'
);

select ok(
  has_table_privilege(
    'service_role', 'private.discord_interaction_claims', 'select,insert,delete'
  ),
  'service role has only the table privileges required by claim and cleanup RPCs'
);

select ok(
  not has_function_privilege(
    'anon', 'private.claim_discord_interaction(text,smallint,integer)', 'execute'
  ),
  'anon cannot claim Discord interactions'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.claim_discord_interaction(text,smallint,integer)',
    'execute'
  ),
  'authenticated users cannot claim Discord interactions'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.claim_discord_interaction(text,smallint,integer)',
    'execute'
  ),
  'service role can atomically claim Discord interactions'
);

select ok(
  private.claim_discord_interaction('100000000000000001', 2, 86400),
  'the first interaction claim succeeds'
);

select ok(
  not private.claim_discord_interaction('100000000000000001', 2, 86400),
  'a duplicate interaction claim loses without replacing the first row'
);

insert into private.discord_interaction_claims (
  interaction_id,
  interaction_type,
  claimed_at,
  expires_at
)
values (
  '100000000000000002',
  3,
  clock_timestamp() - interval '2 hours',
  clock_timestamp() - interval '1 hour'
);

select is(
  private.prune_discord_interaction_claims(1000),
  1::bigint,
  'bounded cleanup prunes expired claims'
);

select is(
  (
    select count(*)
    from private.discord_interaction_claims
    where interaction_id = '100000000000000002'
  ),
  0::bigint,
  'expired claim data is removed'
);

select * from finish();
rollback;
