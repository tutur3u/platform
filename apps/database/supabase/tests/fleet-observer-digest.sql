begin;
select plan(35);

select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace
    and p.proname in ('fleet_get_access', 'fleet_get_digest', 'fleet_publish_digest')
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'browser database roles cannot call Fleet digest RPCs directly');

select ok(not exists (
  select 1 from pg_class c
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
  where c.relnamespace = 'private'::regnamespace
    and c.relname in ('fleet_project_digests', 'fleet_digest_display_values')
    and has_table_privilege(caller, c.oid, privilege)
), 'API roles have no direct access to snapshots or display approvals');

select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('fb000000-0000-4000-8000-000000000001', 'fleet-digest-reader@example.com', now(), '{}', '{}'),
  ('fb000000-0000-4000-8000-000000000002', 'fleet-digest-other@example.com', now(), '{}', '{}');
insert into private.fleet_projects (key, name_en, name_vi)
  values ('digest-test', 'Digest test', 'Kiểm thử'), ('digest-other', 'Other', 'Khác');
insert into private.fleet_digest_display_values (project_key, field, value) values
  ('digest-test', 'lane', 'Observer'), ('digest-test', 'releaseTitle', 'Fleet release'),
  ('digest-test', 'readinessItem', 'Review'), ('digest-other', 'lane', 'Private project');

create function pg_temp.read_fleet_access()
returns jsonb language sql as $$
  select private.fleet_get_access('fb000000-0000-4000-8000-000000000001');
$$;
create function pg_temp.read_fleet_digest()
returns jsonb language sql as $$
  select private.fleet_get_digest('fb000000-0000-4000-8000-000000000001');
$$;

set local role service_role;
select is(pg_temp.read_fleet_access(),
  '{"enabled":false,"tier":null,"projects":[],"capabilities":[],"stopped":false}'::jsonb,
  'signed service lookup defaults to denied with empty scopes');
select is(pg_temp.read_fleet_digest(), null::jsonb, 'no grant denies the digest');
select is(private.fleet_publish_digest('digest-test', now(),
  '[{"lane":"Observer","state":"ready","releaseTitle":"Fleet release","readinessItem":"Review","blockerCodes":[]}]'),
  'published', 'approved project display values publish');
select is(private.fleet_publish_digest('digest-test', now(),
  '[{"lane":"Observer","state":"ready","releaseTitle":"Fleet release","readinessItem":"Review","blockerCodes":[]}]'),
  'published', 'identical snapshot retries idempotently');
select is(private.fleet_publish_digest('digest-test', now() - interval '1 minute', '[]'),
  'stale_snapshot', 'older snapshots cannot replace the latest snapshot');
select is(private.fleet_publish_digest('digest-test', now(), '[]'),
  'stale_snapshot', 'the same timestamp cannot replace a different snapshot');
select is(private.fleet_publish_digest('digest-test', statement_timestamp() + interval '31 seconds', '[]'),
  'invalid_digest', 'a future snapshot cannot prevent subsequent publishes');
select is(private.fleet_publish_digest('digest-test', now() + interval '5 seconds',
  '[{"lane":"Observer","state":"invented","blockerCodes":[]}]'),
  'invalid_digest', 'direct publication rejects unknown lane states');
select is(private.fleet_publish_digest('digest-test', now() + interval '5 seconds',
  '[{"lane":"Observer","state":"ready","blockerCodes":[],"extra":"field"}]'),
  'invalid_digest', 'direct publication rejects extra lane fields');
select is(private.fleet_publish_digest('digest-test', now() + interval '5 seconds', '[42]'),
  'invalid_digest', 'direct publication rejects non-object lanes');
select is(private.fleet_publish_digest('unknown', now(), '[]'),
  'unknown_project', 'unknown projects cannot publish');
select is(private.fleet_publish_digest('digest-test', now() + interval '1 second',
  '[{"lane":"Private project","state":"ready","blockerCodes":[]}]'),
  'unapproved_display_value', 'another project approval cannot admit a label');
select is(private.fleet_publish_digest('digest-test', now() + interval '1 second',
  '[{"lane":"Observer","state":"ready","releaseTitle":"Review","blockerCodes":[]}]'),
  'unapproved_display_value', 'approval is specific to the display field');
select is(private.fleet_publish_digest('digest-other', now(),
  '[{"lane":"Private project","state":"running","blockerCodes":[]}]'),
  'published', 'another project stores an independent snapshot');
reset role;

insert into private.fleet_access_grants (user_id, auth_user_id, tier, capabilities) values
  ('fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'observer', array['status.read']),
  ('fb000000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000002', 'observer', array['ask']);
insert into private.fleet_access_grant_projects (user_id, project_key) values
  ('fb000000-0000-4000-8000-000000000001', 'digest-test'),
  ('fb000000-0000-4000-8000-000000000002', 'digest-other');

set local role service_role;
select is(pg_temp.read_fleet_access(),
  '{"enabled":true,"tier":"observer","projects":["digest-test"],"capabilities":["status.read"],"stopped":false}'::jsonb,
  'the access response has only the live grant scope');
select is(jsonb_path_query_array(pg_temp.read_fleet_digest(), '$[*].projectKey'), '["digest-test"]',
  'the digest returns the authorised project only');
select is(pg_temp.read_fleet_digest() -> 0 -> 'lanes' -> 0 ->> 'releaseTitle', 'Fleet release',
  'the authorised section retains its approved release title');
select is(pg_temp.read_fleet_digest() -> 0 -> 'stale', 'false',
  'freshness starts at server receipt');
select is(private.fleet_get_digest('fb000000-0000-4000-8000-000000000002'), null::jsonb,
  'an ask-only grant cannot read the status digest');
reset role;

update private.fleet_project_digests set received_at = statement_timestamp() - interval '61 minutes'
  where project_key = 'digest-test';
set local role service_role;
select is(private.fleet_publish_digest('digest-test', now(),
  '[{"lane":"Observer","state":"ready","releaseTitle":"Fleet release","readinessItem":"Review","blockerCodes":[]}]'),
  'published', 'the publisher can retry the same snapshot after it ages');
select is(pg_temp.read_fleet_digest() -> 0 -> 'stale', 'true',
  'server receipt controls staleness and an identical retry preserves it');
reset role;

delete from private.fleet_digest_display_values where project_key = 'digest-test' and field = 'releaseTitle';
set local role service_role;
select is(pg_temp.read_fleet_digest(), '[]'::jsonb,
  'withdrawing display approval hides stored content immediately');
reset role;

update private.fleet_control set stopped = true;
set local role service_role;
select is(pg_temp.read_fleet_access() -> 'stopped', 'true', 'access reports the live stop');
select is(pg_temp.read_fleet_digest(), null::jsonb, 'the stop prevents reads');
select is(private.fleet_publish_digest('digest-test', now(), '[]'), 'stopped', 'the stop prevents publishes');
reset role;
update private.fleet_control set stopped = false;

update private.fleet_access_grants set expires_at = now() - interval '1 second'
  where user_id = 'fb000000-0000-4000-8000-000000000001';
set local role service_role;
select is(pg_temp.read_fleet_access() -> 'enabled', 'false', 'expiry disables access');
select is(pg_temp.read_fleet_digest(), null::jsonb, 'expiry disables digest reads');
reset role;

update private.fleet_access_grants set expires_at = null, revoked_at = now()
  where user_id = 'fb000000-0000-4000-8000-000000000001';
set local role service_role;
select is(pg_temp.read_fleet_access() -> 'enabled', 'false', 'revocation disables access');
select is(pg_temp.read_fleet_digest(), null::jsonb, 'revocation disables digest reads');
reset role;

insert into public.workspaces (id, name, creator_id, personal)
  values ('00000000-0000-0000-0000-000000000000', 'Fleet SQL root',
    'fb000000-0000-4000-8000-000000000001', false)
  on conflict (id) do update set creator_id = excluded.creator_id;
insert into public.workspace_members (ws_id, user_id, type)
  values ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-000000000001', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;
update private.fleet_control set owner_user_id = 'fb000000-0000-4000-8000-000000000001';

set local role service_role;
select is(pg_temp.read_fleet_access() -> 'enabled', 'false',
  'the configured UUID alone does not give a root creator Owner access');
reset role;
select private.revoke_mastermind_access(user_id, 'Fleet digest SQL fixture')
  from public.workspace_role_members where role_id = (select role_id from private.mastermind_access_role);
select private.grant_mastermind_access('fb000000-0000-4000-8000-000000000001', 'Fleet digest SQL fixture');

set local role service_role;
select is(pg_temp.read_fleet_access() ->> 'tier', 'owner',
  'the configured UUID and explicit root grant together confer Owner access');
select ok((pg_temp.read_fleet_access() -> 'projects') ?& array['digest-test', 'digest-other'],
  'the live Owner can read every catalog project');
reset role;
select private.revoke_mastermind_access('fb000000-0000-4000-8000-000000000001', 'Fleet digest SQL fixture');

set local role service_role;
select is(pg_temp.read_fleet_access() -> 'enabled', 'false',
  'revoking the root grant immediately removes Owner access');
reset role;

select * from finish();
rollback;
