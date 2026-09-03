begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(3);

select ok(
  exists (
    select 1
    from pg_index index_row
    join pg_class index_class on index_class.oid = index_row.indexrelid
    join pg_am access_method on access_method.oid = index_class.relam
    where index_class.oid = 'public.idx_workspace_api_keys_key_prefix'::regclass
      and index_row.indisvalid
      and index_row.indisready
      and not index_row.indisunique
      and access_method.amname = 'btree'
      and index_row.indnkeyatts = 1
      and pg_get_indexdef(index_row.indexrelid, 1, true) = 'key_prefix'
      and pg_get_expr(index_row.indpred, index_row.indrelid)
        ilike '%key_prefix IS NOT NULL%'
  ),
  'workspace API keys have a valid non-unique partial btree prefix index'
);

select ok(
  exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid =
        'public.idx_workspace_api_keys_ws_id_key_prefix'::regclass
      and index_row.indisunique
      and pg_get_indexdef(index_row.indexrelid, 1, true) = 'ws_id'
      and pg_get_indexdef(index_row.indexrelid, 2, true) = 'key_prefix'
  ),
  'workspace-scoped API key prefix uniqueness remains intact'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '10700000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'plan-107-api-key-index@example.com',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.users (id, display_name)
values (
  '10700000-0000-4000-8000-000000000002',
  'Plan 107 API Key Index Fixture'
)
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (
  '10700000-0000-4000-8000-000000000001',
  'API key prefix index pgTAP',
  '10700000-0000-4000-8000-000000000002',
  false
);

insert into public.workspace_api_keys (
  ws_id,
  name,
  key_hash,
  key_prefix
)
select
  '10700000-0000-4000-8000-000000000001',
  format('Synthetic API key %s', sequence_number),
  format('synthetic-hash-%s', sequence_number),
  'ttr_' || lpad(to_hex(sequence_number), 8, '0')
from generate_series(1, 2000) as sequence_number;

analyze public.workspace_api_keys;
set local enable_seqscan = off;

create function pg_temp.workspace_api_key_lookup_plan(p_key_prefix text)
returns jsonb
language plpgsql
as $$
declare
  query_plan jsonb;
begin
  execute format(
    'explain (format json) select id, ws_id, key_hash, role_id, expires_at
       from public.workspace_api_keys
      where key_prefix = %L
        and (expires_at is null or expires_at > now())',
    p_key_prefix
  ) into query_plan;

  return query_plan;
end;
$$;

select ok(
  pg_temp.workspace_api_key_lookup_plan('ttr_00000001')::text
    like '%idx_workspace_api_keys_key_prefix%',
  'prefix-only API key lookup can use the dedicated partial index'
);

select * from finish();

rollback;
