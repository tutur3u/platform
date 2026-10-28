-- SR-336: staff checks must verify the auth identity, not only the email domain.
-- Seven identities run through every re-pointed policy and function: foreign
-- Azure tenant, home tenant, no Azure identity, unconfirmed, external domain,
-- xwf.tuturuuu.com (admitted only where the original gate admitted it) and a
-- user with no provider identity at all.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temp table sr336_users (id uuid primary key, label text, email text, confirmed boolean, tid text, allowed boolean);
insert into sr336_users values
  ('33600000-0000-4000-8000-000000000001', 'foreign tenant', 'sr336-foreign@tuturuuu.com', true, 'ffffffff-ffff-4fff-8fff-ffffffffffff', false),
  ('33600000-0000-4000-8000-000000000002', 'home tenant', 'sr336-home@tuturuuu.com', true, '23d22ab9-8c8e-4562-a232-a401e15d3880', true),
  ('33600000-0000-4000-8000-000000000003', 'no azure', 'sr336-plain@tuturuuu.com', true, null, true),
  ('33600000-0000-4000-8000-000000000004', 'unconfirmed', 'sr336-unconfirmed@tuturuuu.com', false, null, false),
  ('33600000-0000-4000-8000-000000000005', 'external domain', 'sr336-external@example.com', true, null, false),
  ('33600000-0000-4000-8000-000000000006', 'xwf staff', 'sr336-xwf@xwf.tuturuuu.com', true, null, false),
  ('33600000-0000-4000-8000-000000000007', 'zero identities', 'sr336-bare@tuturuuu.com', true, null, false);
grant select on sr336_users to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, email, case when confirmed then now() end, '{}'::jsonb, '{}'::jsonb from sr336_users
union all
select '33600000-0000-4000-8000-000000000009', 'sr336-owner@example.com', now(), '{}'::jsonb, '{}'::jsonb;
insert into auth.identities (id, provider_id, user_id, identity_data, provider)
select gen_random_uuid(), 'sr336-' || id, id,
  jsonb_build_object('sub', 'sr336-' || id, 'email', email, 'tid', tid,
    'iss', 'https://login.microsoftonline.com/' || tid || '/v2.0'),
  'azure'
from sr336_users where tid is not null;
insert into auth.identities (id, provider_id, user_id, identity_data, provider)
select gen_random_uuid(), id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email'
from sr336_users where tid is null and label <> 'zero identities';

-- Runs one statement as the user under RLS; returns its scalar result,
-- 'ok', or the SQLSTATE it raised.
create function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
    'email', (select email from auth.users where id = p_user))::text, true);
  execute 'set local role authenticated';
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(r, 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;
create function pg_temp.as_owner(p_sql text, p_role text default 'service_role') returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(r, 'ok');
  exception when others then r := sqlstate;
  end;
  return r;
end $$;

-- Fixtures: an owner-created workspace the scenarios are members of, and one
-- they are not (so shortened_links workspace policies cannot admit them).
insert into public.workspaces (id, name, personal, creator_id) values
  ('33600000-0000-4000-8000-0000000000a1', 'SR-336 meetings', false, '33600000-0000-4000-8000-000000000009'),
  ('33600000-0000-4000-8000-0000000000a2', 'SR-336 links', false, '33600000-0000-4000-8000-000000000009');
insert into public.workspace_members (ws_id, user_id, type)
select '33600000-0000-4000-8000-0000000000a1', id, 'MEMBER' from sr336_users on conflict do nothing;
insert into public.shortened_links (id, link, slug, creator_id, domain, ws_id) values
  ('33600000-0000-4000-8000-0000000000b1', 'https://example.com/sr336', 'sr336-fixture',
   '33600000-0000-4000-8000-000000000009', 'example.com', '33600000-0000-4000-8000-0000000000a2');
-- Ten owned workspaces each, so only the staff bypass can admit another.
insert into public.workspaces (name, personal, creator_id)
select 'SR-336 quota ' || n, false, u.id from sr336_users u cross join generate_series(1, 10) n;
-- Isolate the re-pointed quota bypass from the separate creation-permission policy.
alter policy "Enable insert with creator and creation permission check" on public.workspaces with check (false);
insert into public.workspace_meetings (id, ws_id, creator_id, name, time)
select ('33600000-0000-4000-8000-0000000000c' || right(id::text, 1))::uuid,
  '33600000-0000-4000-8000-0000000000a1', id, 'SR-336 elevated', now() from sr336_users;
insert into public.workspaces (id, name, creator_id, personal)
values ('00000000-0000-0000-0000-000000000000', 'Root fixture', '33600000-0000-4000-8000-000000000009', false)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type)
select '00000000-0000-0000-0000-000000000000', id, 'MEMBER' from sr336_users
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', 'MEMBER', 'admin', true)
on conflict do nothing;
update public.workspace_default_permissions set enabled = true
where ws_id = '00000000-0000-0000-0000-000000000000' and member_type = 'MEMBER' and permission = 'admin';
insert into private.infrastructure_employees (user_id, staff_email, managed_name, lifecycle_state)
select id, email, 'SR-336 ' || label, 'active' from sr336_users where email like '%@tuturuuu.com';
update auth.users set raw_app_meta_data = '{"employee_onboarding":true}'::jsonb
where id in (select id from sr336_users);
insert into private.mail_domains (id, domain, status, inbound_provider, verified_at)
values ('33600000-0000-4000-8000-0000000000d1', 'tuturuuu.com', 'active', 'cloudflare', now())
on conflict do nothing;
update private.mail_domains set status = 'active', verified_at = coalesce(verified_at, now())
where domain = 'tuturuuu.com';
insert into private.mail_mailboxes (id, domain_id, address, type, status)
select '33600000-0000-4000-8000-0000000000d2', id, 'sr336-push@tuturuuu.com', 'shared', 'active'
from private.mail_domains where domain = 'tuturuuu.com';
insert into private.mail_mailbox_members (mailbox_id, user_id, role)
select '33600000-0000-4000-8000-0000000000d2', id, 'owner' from sr336_users;

-- Each object yields 'allow' or 'deny' per identity.
create temp table sr336_results (object text, user_id uuid, outcome text);
insert into sr336_results
select 'shortened_links INSERT policy', u.id,
  case pg_temp.as_user(u.id, format($q$insert into public.shortened_links (link, slug, creator_id, domain, ws_id)
    values ('https://example.com/x', %L, %L, 'example.com', '33600000-0000-4000-8000-0000000000a2')$q$,
    'sr336-' || right(u.id::text, 1), u.id)) when 'ok' then 'allow' when '42501' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'shortened_links SELECT policy', u.id,
  case pg_temp.as_user(u.id, $q$select count(*)::text from public.shortened_links where id = '33600000-0000-4000-8000-0000000000b1'$q$)
    when '1' then 'allow' when '0' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'workspaces INSERT quota bypass policy', u.id,
  case pg_temp.as_user(u.id, format($q$insert into public.workspaces (name, personal, creator_id) values ('SR-336 bypass', false, %L)$q$, u.id))
    when 'ok' then 'allow' when '42501' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'workspace_meetings online meeting INSERT policy', u.id,
  case pg_temp.as_user(u.id, format($q$insert into public.workspace_meetings (ws_id, creator_id, name, time)
    values ('33600000-0000-4000-8000-0000000000a1', %L, 'SR-336 meeting', now())$q$, u.id))
    when 'ok' then 'allow' when '42501' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'private.mail_push_recipient_allowed', u.id,
  case pg_temp.as_owner(format($q$select private.mail_push_recipient_allowed(%L, '33600000-0000-4000-8000-0000000000d2')::text$q$, u.id))
    when 'true' then 'allow' when 'false' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'private.meeting_programming_elevated', u.id,
  case pg_temp.as_owner(format($q$select private.meeting_programming_elevated(%L, %L)::text$q$,
    '33600000-0000-4000-8000-0000000000c' || right(u.id::text, 1), u.id))
    when 'true' then 'allow' when 'false' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'private.create_ai_memory_backfill_run', u.id,
  case when r.v ~ '^[0-9a-f-]{36}$' then 'allow' when r.v = '42501' then 'deny' else 'error' end
from sr336_users u
cross join lateral (select pg_temp.as_owner(format($q$select private.create_ai_memory_backfill_run(%L)::text$q$, u.id)) v) r;
insert into sr336_results
select 'private.assert_employee_administrator', u.id,
  case pg_temp.as_owner(format($q$select private.assert_employee_administrator(%L)::text$q$, u.id))
    when '' then 'allow' when 'ok' then 'allow' when '42501' then 'deny' else 'error' end
from sr336_users u;
insert into sr336_results
select 'private.assert_product_feedback_staff', u.id,
  case pg_temp.as_owner(format($q$select private.assert_product_feedback_staff(%L)::text$q$, u.id))
    when '' then 'allow' when 'ok' then 'allow' when 'PT403' then 'deny' else 'error' end
from sr336_users u;

-- Only the workspace quota bypass (public.is_tuturuuu_email) admitted xwf;
-- mail push keeps its own subdomain rule and has no xwf mail domain fixture.
select is(r.outcome,
  case when u.label = 'xwf staff' and r.object like 'workspaces%' then 'allow'
    when u.allowed then 'allow' else 'deny' end,
  r.object || ': ' || u.label)
from sr336_results r join sr336_users u on u.id = r.user_id
where not (u.label = 'xwf staff' and r.object = 'private.mail_push_recipient_allowed')
order by r.object, u.id;

-- Helper contract. Resolved dynamically so the file fails by assertion on main.
create function pg_temp.helper(p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute p_sql into r;
  return r;
exception when others then return sqlstate;
end $$;
select is(pg_temp.helper($q$select (to_regprocedure('public.is_verified_tuturuuu_staff(uuid, boolean)') is not null
  and has_function_privilege('authenticated', 'public.is_verified_tuturuuu_staff(uuid, boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.is_verified_tuturuuu_staff(uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.is_verified_tuturuuu_staff(uuid, boolean)', 'EXECUTE'))::text$q$),
  'true', 'policy helper executable by authenticated and service_role only');
select is(pg_temp.helper($q$select (not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
  where p.oid in ('public.is_verified_tuturuuu_staff(uuid, boolean)'::regprocedure, 'private.is_verified_tuturuuu_staff(uuid, boolean)'::regprocedure,
    'private.staff_identity_verified(uuid)'::regprocedure) and a.grantee = 0))::text$q$),
  'true', 'no helper grants EXECUTE to PUBLIC');
select is(pg_temp.helper($q$select bool_and(not has_function_privilege(r, f, 'EXECUTE'))::text
  from unnest(array['anon', 'authenticated', 'service_role']) r,
  unnest(array['private.is_verified_tuturuuu_staff(uuid, boolean)'::regprocedure, 'private.staff_identity_verified(uuid)'::regprocedure]) f$q$),
  'true', 'unbound private helpers are definer-internal');
select is(pg_temp.helper($q$select (not has_table_privilege('authenticated', 'private.security_config', 'SELECT')
  and not has_table_privilege('service_role', 'private.security_config', 'SELECT')
  and not has_table_privilege('anon', 'private.security_config', 'SELECT'))::text$q$),
  'true', 'tenant pin is readable only by the definer');
select is(pg_temp.helper($q$select (p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
  and p.proconfig = array['search_path=pg_catalog, pg_temp'])::text from pg_proc p
  where p.oid = 'public.is_verified_tuturuuu_staff(uuid, boolean)'::regprocedure$q$),
  'true', 'policy helper is a pinned postgres-owned definer');
select is(pg_temp.as_user('33600000-0000-4000-8000-000000000003',
  $q$select public.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'false', 'authenticated caller cannot ask about another user');
select is(pg_temp.as_user('33600000-0000-4000-8000-000000000003', $q$select public.is_verified_tuturuuu_staff()::text$q$),
  'true', 'authenticated caller defaults to itself');
select is(pg_temp.as_owner($q$select public.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'true', 'service role may ask about any user');
select is(pg_temp.as_owner($q$select public.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000001')::text$q$),
  'false', 'service role sees the foreign tenant refused');

update auth.users set email = 'sr336-plain@xwf.tuturuuu.com' where id = '33600000-0000-4000-8000-000000000003';
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000003')::text$q$),
  'false', 'xwf.tuturuuu.com is refused by default');
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000003', true)::text$q$),
  'true', 'xwf.tuturuuu.com is admitted only when explicitly allowed');
update auth.users set email = 'sr336-plain@tuturuuu.com.evil.test' where id = '33600000-0000-4000-8000-000000000003';
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000003')::text$q$),
  'false', 'domain suffix spoof is refused');
update auth.users set email = 'sr336-plain@tuturuuu.com' where id = '33600000-0000-4000-8000-000000000003';

update auth.identities set identity_data = identity_data - 'tid' where user_id = '33600000-0000-4000-8000-000000000002';
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'true', 'tenant derived from a home issuer is accepted');
update auth.identities set identity_data = identity_data || '{"tid":"23d22ab9-8c8e-4562-a232-a401e15d3880","iss":"https://sts.windows.net/ffffffff-ffff-4fff-8fff-ffffffffffff/"}'
where user_id = '33600000-0000-4000-8000-000000000002';
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'false', 'home tid with a foreign issuer is refused');
update auth.identities set identity_data = identity_data || '{"iss":"https://login.microsoftonline.com/23d22ab9-8c8e-4562-a232-a401e15d3880/v2.0"}'
where user_id = '33600000-0000-4000-8000-000000000002';
insert into auth.identities (id, provider_id, user_id, identity_data, provider)
values (gen_random_uuid(), 'sr336-second', '33600000-0000-4000-8000-000000000002',
  '{"sub":"sr336-second","tid":"ffffffff-ffff-4fff-8fff-ffffffffffff"}', 'azure');
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'false', 'every Azure identity must belong to the home tenant');
delete from auth.identities where provider_id = 'sr336-second';
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'true', 'home tenant restored');
select pg_temp.helper($q$update private.security_config set value = ' ' where key = 'azure_staff_tenant_id' returning key$q$);
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'false', 'empty tenant pin fails closed for Azure identities');
select pg_temp.helper($q$delete from private.security_config where key = 'azure_staff_tenant_id' returning key$q$);
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000002')::text$q$),
  'false', 'missing tenant pin fails closed for Azure identities');
select is(pg_temp.helper($q$select private.is_verified_tuturuuu_staff('33600000-0000-4000-8000-000000000003')::text$q$),
  'true', 'missing tenant pin does not affect staff without Azure identities');

select * from finish();
rollback;
