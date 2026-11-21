begin;
select plan(79);

-- Storage and privilege boundary.
create temporary view vault_test_tables as
select oid, relname, relrowsecurity from pg_class
where relnamespace = 'private'::regnamespace and relkind = 'r' and relname like 'vault\_%';
select is((select count(*) from vault_test_tables), 9::bigint, 'vault tables exist');
select ok(not exists (select 1 from vault_test_tables where not relrowsecurity), 'every vault table has RLS enabled');
select ok(not exists (
  select 1 from vault_test_tables t
  cross join unnest(array['anon', 'authenticated', 'service_role']) as caller
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
  where has_table_privilege(caller, t.oid, privilege)
), 'API roles have no direct vault table privileges');
select ok(not exists (
  select 1 from pg_proc p
  cross join unnest(array['anon', 'authenticated']) as caller
  where p.pronamespace = 'private'::regnamespace and p.proname like 'vault\_%'
    and has_function_privilege(caller, p.oid, 'EXECUTE')
), 'client roles cannot execute vault functions');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace
    and p.proname in ('vault_require_member', 'vault_lock', 'vault_user_of')
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'internal vault helpers are not executable by the service role');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname like 'vault\_%'
    and p.proname <> 'vault_workspace_creator'
    and pg_get_userbyid(p.proowner) <> 'vault_definer'
), 'every vault function except the creator lookup is owned by vault_definer');
select ok(has_function_privilege('vault_definer', 'private.vault_workspace_creator(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.vault_workspace_creator(uuid)', 'EXECUTE'),
  'only vault_definer can call the creator lookup');
select ok(not exists (
  select 1 from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname like 'vault\_%'
    and not (p.proconfig @> array['search_path=pg_catalog, pg_temp'])
), 'every vault function pins search_path to pg_catalog, pg_temp');
select ok((select not rolcanlogin and not rolbypassrls and not rolinherit from pg_roles where rolname = 'vault_definer'),
  'vault_definer cannot log in, bypass RLS or inherit');
select ok(not has_table_privilege('vault_definer', 'private.vault_audit_events', 'UPDATE')
  and not has_table_privilege('vault_definer', 'private.vault_audit_events', 'DELETE'),
  'audit events are append-only for the definer');
select ok(not has_table_privilege('vault_definer', 'public.workspace_members', 'SELECT')
  and not has_table_privilege('vault_definer', 'private.people_workspace_keys', 'SELECT'),
  'vault_definer has no privileges outside the vault tables');

-- Fixtures: A creates the workspace, B is a member, C is an outsider.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ae000000-0000-4000-8000-000000000001', 'vault-owner@example.com', now(), '{}', '{}'),
  ('ae000000-0000-4000-8000-000000000002', 'vault-member@example.com', now(), '{}', '{}'),
  ('ae000000-0000-4000-8000-000000000003', 'vault-outsider@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal) values
  ('ae100000-0000-4000-8000-000000000001', 'Vault tenant', 'ae000000-0000-4000-8000-000000000001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', 'MEMBER'),
  ('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;

-- Creation needs the workspace creator.
select throws_ok($$select private.vault_create('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000003', decode(repeat('01', 32), 'hex'), '\x01')$$,
  '42501', null, 'an outsider cannot create a vault');
select throws_ok($$select private.vault_create('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', decode(repeat('01', 32), 'hex'), '\x01')$$,
  '42501', null, 'a member who is not the workspace creator cannot create a vault, even with default admin');
select lives_ok($$select private.vault_create('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', decode(repeat('01', 32), 'hex'), '\x01')$$,
  'the workspace creator creates the vault');
select throws_ok($$select private.vault_create('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', decode(repeat('02', 32), 'hex'), '\x01')$$,
  '23505', null, 'a workspace has one vault');

-- Staging.
select throws_ok($$select private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000003', 'ciphertext', '\xc0ffee')$$,
  '42501', null, 'an outsider cannot stage');
select is(private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'ciphertext', '\xc0ffee'),
  sha256('\xc0ffee'::bytea), 'staging returns the payload hash');
select is(private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'ciphertext', '\xc0ffee'),
  sha256('\xc0ffee'::bytea), 'staging the same payload is idempotent');
select throws_ok($$select private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'other', '\x01')$$,
  '23514', null, 'staging rejects an unknown kind');

-- Key log publication is ordered and idempotent.
select throws_ok($$select private.vault_publish_entry('ae100000-0000-4000-8000-000000000001', 2, decode(repeat('aa', 32), 'hex'), '\x01')$$,
  '22023', null, 'entries publish in order');
select is(private.vault_publish_entry('ae100000-0000-4000-8000-000000000001', 1, decode(repeat('aa', 32), 'hex'), '\x01'), 'published', 'entry 1 publishes');
select is(private.vault_publish_entry('ae100000-0000-4000-8000-000000000001', 1, decode(repeat('aa', 32), 'hex'), '\x01'), 'duplicate', 'republishing entry 1 is a no-op');
select throws_ok($$select private.vault_publish_entry('ae100000-0000-4000-8000-000000000001', 1, decode(repeat('bb', 32), 'hex'), '\x02')$$,
  '23505', null, 'a different entry at a published sequence conflicts');
select is((select count(*) from private.vault_read_log('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 0, 10)), 1::bigint,
  'a member reads the key log');
select throws_ok($$select * from private.vault_read_log('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000003', 0, 10)$$,
  '42501', null, 'an outsider cannot read the key log');

-- Records promote their staged ciphertext.
select is(private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c1', 32), 'hex'), 'prod', 'var-1', 1, '\x0a', sha256('\xc0ffee'::bytea)),
  'published', 'a record publishes with its staged ciphertext');
select is((select count(*) from private.vault_staged_payloads where payload_hash = sha256('\xc0ffee'::bytea)), 0::bigint,
  'the promoted payload leaves staging');
select is(private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c1', 32), 'hex'), 'prod', 'var-1', 1, '\x0a', sha256('\xc0ffee'::bytea)),
  'duplicate', 'republishing a record is a no-op');
select throws_ok($$select private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c2', 32), 'hex'), 'prod', 'var-1', 2, '\x0b', sha256('\xbad0'::bytea))$$,
  'P0002', null, 'a record whose ciphertext was not staged is refused');
select throws_ok($$select private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c3', 32), 'hex'), 'prod', 'var-1', 1, '\x0c', null)$$,
  '23505', null, 'a second record for the same version conflicts');
select is(private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c4', 32), 'hex'), 'prod', 'var-1', 2, '\x0d', null),
  'published', 'a tombstone publishes without ciphertext');
select is((select row(version, record_hash = decode(repeat('c4', 32), 'hex'), ciphertext is null)::text
  from private.vault_read_records('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'prod', array['var-1'])),
  '(2,t,t)', 'reads return the latest version per variable');
select throws_ok($$select * from private.vault_read_records('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000003', 'prod', array['var-1'])$$,
  '42501', null, 'an outsider cannot read records');
select throws_ok($$insert into private.vault_records (ws_id, record_hash, env, variable_id, version, signed_record, ciphertext_hash, ciphertext)
  values ('ae100000-0000-4000-8000-000000000001', decode(repeat('c5', 32), 'hex'), 'prod', 'var-2', 1, '\x0e', decode(repeat('00', 32), 'hex'), '\xc0ffee')$$,
  '23514', null, 'stored ciphertext must match its hash');

-- Wraps promote by digest.
select is(private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', 'wrap', '\xfeed'), sha256('\xfeed'::bytea), 'a wrap stages');
select is(private.vault_publish_wrap('ae100000-0000-4000-8000-000000000001', 'prod', 1, decode(repeat('f1', 32), 'hex'), 'edk', sha256('\xfeed'::bytea)),
  'published', 'a staged wrap publishes');
select throws_ok($$select private.vault_publish_wrap('ae100000-0000-4000-8000-000000000001', 'prod', 1, decode(repeat('f1', 32), 'hex'), 'edk', sha256('\xbeef'::bytea))$$,
  '23505', null, 'a different wrap for the same recipient, kind and epoch conflicts');
select is((select count(*) from private.vault_read_wraps('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', decode(repeat('f1', 32), 'hex'), null, null)),
  1::bigint, 'a member reads wraps addressed to a fingerprint');

-- Keyrings use compare-and-swap and stay per user.
select is(private.vault_put_keyring('ae000000-0000-4000-8000-000000000002', decode(repeat('d2', 16), 'hex'), null, '\x01'), 0::bigint, 'a keyring is created');
select throws_ok($$select private.vault_put_keyring('ae000000-0000-4000-8000-000000000002', decode(repeat('d3', 16), 'hex'), null, '\x01')$$,
  '23505', null, 'a user has one keyring');
select throws_ok($$select private.vault_put_keyring('ae000000-0000-4000-8000-000000000002', decode(repeat('d2', 16), 'hex'), 5, '\x02')$$,
  '40001', null, 'a stale counter is refused');
select is(private.vault_put_keyring('ae000000-0000-4000-8000-000000000002', decode(repeat('d2', 16), 'hex'), 0, '\x02'), 1::bigint, 'the expected counter advances');
select is((select count(*) from private.vault_get_keyring('ae000000-0000-4000-8000-000000000003')), 0::bigint, 'another user sees no keyring');

-- Unlock wraps keep at least one strong method.
select lives_ok($$select private.vault_put_unlock_wrap('ae000000-0000-4000-8000-000000000002', 'passkey', decode(repeat('a1', 16), 'hex'), '\x01', '\x02')$$, 'a passkey unlock wrap is stored');
select throws_ok($$select private.vault_delete_unlock_wrap('ae000000-0000-4000-8000-000000000002', 'passkey', decode(repeat('a1', 16), 'hex'))$$,
  '23514', null, 'the last strong unlock method cannot be removed');
select lives_ok($$select private.vault_put_unlock_wrap('ae000000-0000-4000-8000-000000000002', 'recovery', decode(repeat('a2', 16), 'hex'), '\x01', '\x02')$$, 'a recovery unlock wrap is stored');
select lives_ok($$select private.vault_delete_unlock_wrap('ae000000-0000-4000-8000-000000000002', 'passkey', decode(repeat('a1', 16), 'hex'))$$, 'a strong method can go while another remains');
select throws_ok($$select private.vault_put_unlock_wrap('ae000000-0000-4000-8000-000000000003', 'recovery', decode(repeat('a3', 16), 'hex'), '\x01', '\x02')$$,
  '42501', null, 'a user without a keyring cannot store unlock wraps');

-- Vault passkey counters.
select lives_ok($$select private.vault_register_passkey('ae000000-0000-4000-8000-000000000002', decode(repeat('b1', 16), 'hex'), decode(repeat('0b', 64), 'hex'), array['internal'])$$, 'a vault passkey registers');
select lives_ok($$select private.vault_record_passkey_use('ae000000-0000-4000-8000-000000000002', decode(repeat('b1', 16), 'hex'), 3)$$, 'a counter advances from zero');
select throws_ok($$select private.vault_record_passkey_use('ae000000-0000-4000-8000-000000000002', decode(repeat('b1', 16), 'hex'), 0)$$,
  '22023', null, 'a counter cannot fall back to zero once used');
select throws_ok($$select private.vault_record_passkey_use('ae000000-0000-4000-8000-000000000003', decode(repeat('b1', 16), 'hex'), 9)$$,
  '42501', null, 'another user cannot use the credential');

-- Audit truncates addresses and chains hashes; reading needs the workspace creator.
select ok(private.vault_audit('ae100000-0000-4000-8000-000000000001', 'user', 'ae000000-0000-4000-8000-000000000002', 'value.reveal',
  '{"name": "DATABASE_URL"}', '203.0.113.77', 'firefox', null, 'ok') > 0, 'an audit event is appended');
select ok(private.vault_audit('ae100000-0000-4000-8000-000000000001', 'machine', 'grant-1', 'value.run',
  '{}', '2001:db8:1:2::9', null, 'grant-1', 'ok') > 0, 'a second event is appended');
select is((select array_agg(ip_prefix::text order by id) from private.vault_audit_events where ws_id = 'ae100000-0000-4000-8000-000000000001'),
  array['203.0.113.0/24', '2001:db8:1::/48'], 'addresses are stored as /24 and /48 prefixes');
select ok((select e2.prev_hash = e1.event_hash from private.vault_audit_events e1 join private.vault_audit_events e2 on e2.id = e1.id + 1
  where e1.ws_id = 'ae100000-0000-4000-8000-000000000001' order by e1.id limit 1), 'each event chains to the previous hash');
select throws_ok($$select * from private.vault_read_audit('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', null, 10)$$,
  '42501', null, 'a member who is not the workspace creator cannot read audit');
select is((select count(*) from private.vault_read_audit('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', null, 10)),
  2::bigint, 'the workspace creator reads audit');

-- Fences on republication, expiry and kinds.
select throws_ok($$select private.vault_publish_entry('ae100000-0000-4000-8000-000000000001', 1, decode(repeat('aa', 32), 'hex'), '\x09')$$,
  '23505', null, 'a republish with the same hash but different bytes conflicts');
select throws_ok($$select private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c1', 32), 'hex'), 'prod', 'var-9', 1, '\x0a', sha256('\xc0ffee'::bytea))$$,
  '23505', null, 'a record republish with different columns conflicts');
select is(private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'ciphertext', '\xdead'), sha256('\xdead'::bytea), 'a payload stages for the expiry check');
update private.vault_staged_payloads set expires_at = now() - interval '1 second' where payload_hash = sha256('\xdead'::bytea);
select throws_ok($$select private.vault_publish_record('ae100000-0000-4000-8000-000000000001', decode(repeat('c6', 32), 'hex'), 'prod', 'var-3', 1, '\x0f', sha256('\xdead'::bytea))$$,
  'P0002', null, 'an expired staged payload is never promoted');
select throws_ok($$select private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'wrap', '\xdead')$$,
  '23505', null, 'the same bytes cannot be restaged as another kind');
select lives_ok($$select private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000002', 'ciphertext', '\xdead')$$,
  'restaging the same kind refreshes the expiry');
select ok((select expires_at > now() from private.vault_staged_payloads where payload_hash = sha256('\xdead'::bytea)), 'the refreshed payload is live again');
select is(private.vault_stage('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', 'wrap', '\xbeefcafe'), sha256('\xbeefcafe'::bytea), 'a second wrap stages');
select throws_ok($$select private.vault_publish_wrap('ae100000-0000-4000-8000-000000000001', 'prod', 1, decode(repeat('f2', 32), 'hex'), 'edk', sha256('\xbeefca'::bytea))$$,
  'P0002', null, 'a wrap whose digest matches no staged payload is refused');
select throws_ok($$insert into private.vault_wraps (ws_id, env, epoch, recipient_fp, key_kind, wrap, digest)
  values ('ae100000-0000-4000-8000-000000000001', 'prod', 1, decode(repeat('f3', 32), 'hex'), 'edk', '\x01', decode(repeat('00', 32), 'hex'))$$,
  '23514', null, 'a stored wrap must match its digest');

-- Tenant and owner boundaries.
insert into public.workspaces (id, name, creator_id, personal) values
  ('ae100000-0000-4000-8000-000000000002', 'Other vault tenant', 'ae000000-0000-4000-8000-000000000003', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('ae100000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000003', 'MEMBER')
  on conflict (ws_id, user_id) do update set type = excluded.type;
select throws_ok($$select * from private.vault_read_records('ae100000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000002', 'prod', array['var-1'])$$,
  '42501', null, 'a member of one workspace cannot read another workspace');
select throws_ok($$select private.vault_put_keyring('ae000000-0000-4000-8000-000000000003', decode(repeat('d2', 16), 'hex'), 1, '\x03')$$,
  '40001', null, 'one user cannot write another user''s keyring');
select lives_ok($$select private.vault_record_passkey_use('ae000000-0000-4000-8000-000000000002', decode(repeat('b1', 16), 'hex'), 4)$$, 'a larger counter is accepted');
select throws_ok($$select private.vault_record_passkey_use('ae000000-0000-4000-8000-000000000002', decode(repeat('b1', 16), 'hex'), 4)$$,
  '22023', null, 'a repeated non-zero counter is refused');
select is((select count(*) from private.vault_unlock_wraps where method = 'recovery' and vault_user_id = decode(repeat('d2', 16), 'hex')), 1::bigint,
  'the last strong method survives a refused delete');
select throws_ok($$select private.vault_delete_unlock_wrap('ae000000-0000-4000-8000-000000000002', 'recovery', decode(repeat('a2', 16), 'hex'))$$,
  '23514', null, 'deleting the last remaining strong method is refused');
select is((select count(*) from private.vault_unlock_wraps where method = 'recovery' and vault_user_id = decode(repeat('d2', 16), 'hex')), 1::bigint,
  'the refused delete leaves the row in place');
select ok(not pg_has_role('anon', 'vault_definer', 'member') and not pg_has_role('authenticated', 'vault_definer', 'member')
  and not pg_has_role('service_role', 'vault_definer', 'member'), 'no API role is a member of vault_definer');
select ok(not has_table_privilege('vault_definer', 'private.vault_key_log', 'UPDATE') and not has_table_privilege('vault_definer', 'private.vault_key_log', 'DELETE')
  and not has_table_privilege('vault_definer', 'private.vault_records', 'UPDATE') and not has_table_privilege('vault_definer', 'private.vault_wraps', 'DELETE')
  and not has_table_privilege('vault_definer', 'private.vault_genesis', 'UPDATE'), 'the key log, records, wraps and genesis are append-only for the definer');
select is((select e2.prev_hash from private.vault_audit_events e1 join private.vault_audit_events e2 on e2.id = e1.id + 1
  where e1.ws_id = 'ae100000-0000-4000-8000-000000000001' order by e1.id limit 1),
  (select e1.event_hash from private.vault_audit_events e1 where e1.ws_id = 'ae100000-0000-4000-8000-000000000001' order by e1.id limit 1),
  'the second event links to the first event hash');
select is((select event_hash from private.vault_audit_events where ws_id = 'ae100000-0000-4000-8000-000000000001' order by id limit 1),
  (select sha256(convert_to(jsonb_build_object('ws', e.ws_id, 'actor_kind', e.actor_kind, 'actor_id', e.actor_id, 'event', e.event,
     'resource', e.resource, 'ip', e.ip_prefix, 'ua', e.ua_family, 'grant', e.grant_id, 'result', e.result, 'at', e.created_at)::text, 'UTF8'))
   from private.vault_audit_events e where e.ws_id = 'ae100000-0000-4000-8000-000000000001' order by e.id limit 1),
  'the first event hash is the SHA-256 of its canonical preimage');

select * from finish();
rollback;
