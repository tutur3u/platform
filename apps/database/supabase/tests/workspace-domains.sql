-- Workspace custom domains (20261111120100): staff identity gate, entitlement
-- reasons, kill switch, cap, platform-subdomain quarantine, immutable
-- identity and member-only reads.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('d0a10000-0000-4000-8000-000000000001', 'wsd-staff@tuturuuu.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('d0a10000-0000-4000-8000-000000000002', 'wsd-xwf@xwf.tuturuuu.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('d0a10000-0000-4000-8000-000000000003', 'wsd-lookalike@tuturuuu.com.evil.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('d0a10000-0000-4000-8000-000000000004', 'wsd-unconfirmed@tuturuuu.com', null, '{}'::jsonb, '{}'::jsonb),
  ('d0a10000-0000-4000-8000-000000000005', 'WSD-Upper@TUTURUUU.COM', now(), '{}'::jsonb, '{}'::jsonb),
  ('d0a10000-0000-4000-8000-000000000006', 'wsd-owner@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('d0a10000-0000-4000-8000-000000000007', 'wsd-prefix@eviltuturuuu.com', now(), '{}'::jsonb, '{}'::jsonb);
insert into auth.identities (id, provider_id, user_id, identity_data, provider)
select gen_random_uuid(), id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email'
from auth.users where id::text like 'd0a10000-%';

-- The entitlement helpers run as the service role in apps/web.
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

select ok(public.is_verified_tuturuuu_staff('d0a10000-0000-4000-8000-000000000001', false), 'confirmed @tuturuuu.com is staff');
select ok(not public.is_verified_tuturuuu_staff('d0a10000-0000-4000-8000-000000000002', false), 'xwf.tuturuuu.com is not staff');
select ok(not public.is_verified_tuturuuu_staff('d0a10000-0000-4000-8000-000000000003', false), 'tuturuuu.com.evil.com is not staff');
select ok(not public.is_verified_tuturuuu_staff('d0a10000-0000-4000-8000-000000000004', false), 'unconfirmed email is not staff');
select ok(public.is_verified_tuturuuu_staff('d0a10000-0000-4000-8000-000000000005', false), 'domain match is case-insensitive');
select ok(not public.is_verified_tuturuuu_staff('d0a10000-0000-4000-8000-000000000007', false), 'eviltuturuuu.com is not staff');
select ok(not public.is_verified_tuturuuu_staff(null, false), 'null actor is not staff');

insert into public.workspaces (id, name, personal, creator_id) values
  ('d0a10000-0000-4000-8000-0000000000a1', 'WSD staff', false, 'd0a10000-0000-4000-8000-000000000001'),
  ('d0a10000-0000-4000-8000-0000000000a2', 'WSD customer', false, 'd0a10000-0000-4000-8000-000000000006'),
  ('d0a10000-0000-4000-8000-0000000000a3', 'WSD xwf', false, 'd0a10000-0000-4000-8000-000000000002');

select is(
  private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a1', 'd0a10000-0000-4000-8000-000000000001') ->> 'source',
  'staff_bypass', 'staff creator gets the bypass');
select is(
  private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a3', 'd0a10000-0000-4000-8000-000000000002') ->> 'allowed',
  'false', 'xwf creator gets no bypass');
select is(
  private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a2', 'd0a10000-0000-4000-8000-000000000001') ->> 'allowed',
  'false', 'staff without the workspace permission gets no bypass');
select is(
  private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a2', 'd0a10000-0000-4000-8000-000000000006') ->> 'reason',
  'paid_plan_required', 'free customer workspace needs a paid plan');

update private.workspace_domain_settings set enabled = false;
select is(
  private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a1', 'd0a10000-0000-4000-8000-000000000001') ->> 'reason',
  'kill_switch', 'kill switch denies the bypass too');
select throws_ok($$
  insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
  values ('d0a10000-0000-4000-8000-0000000000a1', 'killed.example.com', 'custom', '_tuturuuu-verify.killed.example.com',
    'tuturuuu-domain-verification=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'staff_bypass')
$$, '42501', null, 'kill switch blocks inserts');
update private.workspace_domain_settings set enabled = true;

insert into private.workspace_domain_caps (ws_id, domain_cap, reason)
values ('d0a10000-0000-4000-8000-0000000000a1', 1, 'test cap');
insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source, created_by)
values ('d0a10000-0000-4000-8000-0000000000a1', 'wsd-one.ttr.gg', 'platform_subdomain', '_tuturuuu-verify.wsd-one.ttr.gg',
  'tuturuuu-domain-verification=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'staff_bypass', 'd0a10000-0000-4000-8000-000000000001');
select throws_ok($$
  insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
  values ('d0a10000-0000-4000-8000-0000000000a1', 'wsd-two.ttr.gg', 'platform_subdomain', '_tuturuuu-verify.wsd-two.ttr.gg',
    'tuturuuu-domain-verification=cccccccccccccccccccccccccccccccccccc', 'staff_bypass')
$$, '23514', null, 'per-workspace cap is enforced at persistence');
select is(
  private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a1', 'd0a10000-0000-4000-8000-000000000001') ->> 'reason',
  'cap_reached', 'entitlement reports the cap');

select throws_ok($$
  update public.workspace_domains set hostname = 'moved.ttr.gg' where hostname = 'wsd-one.ttr.gg'
$$, '42501', null, 'hostname is immutable');

update public.workspace_domains set status = 'removed', removed_at = now() where hostname = 'wsd-one.ttr.gg';
select throws_ok($$
  insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
  values ('d0a10000-0000-4000-8000-0000000000a2', 'wsd-one.ttr.gg', 'platform_subdomain', '_tuturuuu-verify.wsd-one.ttr.gg',
    'tuturuuu-domain-verification=dddddddddddddddddddddddddddddddddddd', 'paid_addon')
$$, '23505', null, 'removed platform subdomain is quarantined for other workspaces');
select lives_ok($$
  insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
  values ('d0a10000-0000-4000-8000-0000000000a1', 'wsd-one.ttr.gg', 'platform_subdomain', '_tuturuuu-verify.wsd-one.ttr.gg',
    'tuturuuu-domain-verification=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'staff_bypass')
$$, 'the removing workspace may re-add its own name');
select throws_ok($$
  update public.workspace_domains set status = 'active', activated_at = now() where hostname = 'wsd-one.ttr.gg' and status = 'removed'
$$, '42501', null, 'removed rows stay removed');

select is((
  select status from public.workspace_domains where hostname = 'wsd-one.ttr.gg' and status <> 'removed'
), 'pending_verification', 'new bindings start pending verification');

-- A live custom binding (like the seeded vohoangphuc.com) cannot be claimed
-- by another workspace.
insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
values ('d0a10000-0000-4000-8000-0000000000a3', 'wsd-bootstrap.example.com', 'custom', '_tuturuuu-verify.wsd-bootstrap.example.com',
  'tuturuuu-domain-verification=gggggggggggggggggggggggggggggggggggg', 'staff_bypass');
select throws_ok($$
  insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
  values ('d0a10000-0000-4000-8000-0000000000a2', 'wsd-bootstrap.example.com', 'custom', '_tuturuuu-verify.wsd-bootstrap.example.com',
    'tuturuuu-domain-verification=hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh', 'paid_addon')
$$, '23505', null, 'a live hostname cannot be claimed by another workspace');

-- Member reads through RLS; others see nothing and cannot write.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd0a10000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.workspace_domains), 1, 'workspace creator reads live bindings');
select set_config('request.jwt.claims', json_build_object('sub', 'd0a10000-0000-4000-8000-000000000006', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.workspace_domains), 0, 'other users read nothing');
select throws_ok($$
  insert into public.workspace_domains (ws_id, hostname, kind, verification_txt_name, verification_txt_value, entitlement_source)
  values ('d0a10000-0000-4000-8000-0000000000a2', 'client.example.com', 'custom', '_tuturuuu-verify.client.example.com',
    'tuturuuu-domain-verification=ffffffffffffffffffffffffffffffffffff', 'paid_addon')
$$, '42501', null, 'clients cannot insert bindings');
select throws_ok($$ select private.workspace_domain_entitlement('d0a10000-0000-4000-8000-0000000000a2', null) $$,
  '42501', null, 'clients cannot call the entitlement function');
reset role;

select * from finish();
rollback;
