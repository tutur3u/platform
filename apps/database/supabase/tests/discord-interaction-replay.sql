begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select has_table(
  'private',
  'discord_interaction_claims',
  'Discord interaction claims are stored privately'
);

select columns_are(
  'private',
  'discord_interaction_claims',
  array[
    'interaction_id',
    'interaction_type',
    'claimed_at',
    'lease_expires_at',
    'completed_at',
    'response_payload',
    'expires_at'
  ],
  'claim rows contain only dispatch lifecycle data'
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
    'service_role',
    'private.discord_interaction_claims',
    'select,insert,update,delete'
  ),
  'service role has the table privileges required by lifecycle RPCs'
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
  not has_function_privilege(
    'anon',
    'private.complete_discord_interaction(text,smallint,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.release_discord_interaction(text,smallint)',
    'execute'
  ),
  'non-service roles cannot complete or release Discord interactions'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.complete_discord_interaction(text,smallint,jsonb)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'private.release_discord_interaction(text,smallint)',
    'execute'
  ),
  'service role can complete and release Discord interactions'
);

select is(
  private.claim_discord_interaction('100000000000000001', 2, 86400)->>'state',
  'claimed',
  'the first interaction claim succeeds'
);

create temporary table first_claim_snapshot as
select *
from private.discord_interaction_claims
where interaction_id = '100000000000000001';

select ok(
  private.claim_discord_interaction('100000000000000001', 2, 86400)->>'state'
    = 'processing'
  and exists (
    select 1
    from private.discord_interaction_claims current_claim
    join first_claim_snapshot original_claim using (interaction_id)
    where current_claim.interaction_type = original_claim.interaction_type
      and current_claim.claimed_at = original_claim.claimed_at
      and current_claim.lease_expires_at = original_claim.lease_expires_at
      and current_claim.expires_at = original_claim.expires_at
  ),
  'an active duplicate loses without replacing the first lease'
);

select ok(
  private.complete_discord_interaction(
    '100000000000000001',
    2,
    '{"type": 9, "data": {"title": "Ticket"}}'::jsonb
  ),
  'a claimed interaction can persist its callback response'
);

select is(
  private.claim_discord_interaction('100000000000000001', 2, 86400)->'response',
  '{"type": 9, "data": {"title": "Ticket"}}'::jsonb,
  'a completed duplicate replays the original callback response'
);

select is(
  private.claim_discord_interaction('100000000000000003', 5, 86400)->>'state',
  'claimed',
  'a second interaction can be claimed before a failed dispatch'
);

select lives_ok(
  $$select private.release_discord_interaction('100000000000000003', 5)$$,
  'an unfinished interaction claim can be released'
);

select is(
  private.claim_discord_interaction('100000000000000003', 5, 86400)->>'state',
  'claimed',
  'a released interaction can be claimed by a retry'
);

select throws_ok(
  $$select private.prune_discord_interaction_claims(null)$$,
  'P0001',
  'invalid Discord interaction prune limit',
  'an explicit null prune limit is rejected'
);

insert into private.discord_interaction_claims (
  interaction_id,
  interaction_type,
  claimed_at,
  lease_expires_at,
  expires_at
)
values (
  '100000000000000002',
  3,
  clock_timestamp() - interval '2 hours',
  clock_timestamp() - interval '90 minutes',
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
