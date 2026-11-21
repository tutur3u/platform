-- Meeting short links (20261121160000): service-only writes, the meet/ prefix
-- namespace, staff-only root and vanity slugs, canonical targets, meeting
-- cascade and the actor-scoped audit history.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('5a0e0000-0000-4000-8000-000000000001', 'msl-staff@tuturuuu.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5a0e0000-0000-4000-8000-000000000002', 'msl-member@example.com', now(), '{}'::jsonb, '{}'::jsonb);
insert into auth.identities (id, provider_id, user_id, identity_data, provider)
select gen_random_uuid(), id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email'
from auth.users where id::text like '5a0e0000-%';

insert into public.workspaces (id, name, personal, creator_id) values
  ('5a0e0000-0000-4000-8000-0000000000a1', 'MSL workspace', false, '5a0e0000-0000-4000-8000-000000000001'),
  ('5a0e0000-0000-4000-8000-0000000000a2', 'MSL other', false, '5a0e0000-0000-4000-8000-000000000002');
insert into public.workspace_members (ws_id, user_id)
values ('5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-000000000002')
on conflict do nothing;
insert into public.workspace_meetings (id, ws_id, creator_id, name) values
  ('5a0e0000-0000-4000-8000-0000000000b1', '5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-000000000001', 'MSL standup'),
  ('5a0e0000-0000-4000-8000-0000000000b2', '5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-000000000002', 'MSL sync');

create temporary table msl_target as
select 'https://tuturuuu.com/meet/5a0e0000-0000-4000-8000-0000000000a1/meetings/5a0e0000-0000-4000-8000-0000000000b1'::text as b1,
       'https://tuturuuu.com/meet/5a0e0000-0000-4000-8000-0000000000a1/meetings/5a0e0000-0000-4000-8000-0000000000b2'::text as b2;
grant select on msl_target to authenticated, service_role;

-- The Meet API writes as the service role.
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;

select lives_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'meet/Ab3dE9x', b2, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000002', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b2', 'generated', now() + interval '30 days' from msl_target
$$, 'a non-staff creator gets a generated meet/ code');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'meet/Zz9Zz9Q', b2, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000002', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b2', 'generated', now() + interval '30 days' from msl_target
$$, '23505', null, 'one generated link per meeting');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'Qw3rTy7', b2, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000002', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b2', 'vanity', now() + interval '30 days' from msl_target
$$, '42501', null, 'a non-staff creator cannot drop the meet/ prefix');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'meet/member-standup', b2, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000002', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b2', 'vanity', now() + interval '30 days' from msl_target
$$, '42501', null, 'a non-staff creator cannot set a vanity slug');

select lives_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'msl-standup', b1, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b1', 'vanity', now() + interval '365 days' from msl_target
$$, 'staff can set a root vanity slug');

select lives_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'Rt5oot1', b1, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b1', 'generated', now() + interval '30 days' from msl_target
$$, 'staff can take a root-level generated code');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'Bad--Slug', b1, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b1', 'vanity', now() + interval '30 days' from msl_target
$$, '23514', null, 'vanity slugs use the lowercase charset');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  values ('meet/Evil123', 'https://evil.example/', 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001',
    '5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-0000000000b1', 'generated', now() + interval '1 day')
$$, '23514', null, 'meeting links only target the canonical join URL');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'meet/Ws0ther', replace(b1, '0000000000a1', '0000000000a2'), 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001',
    '5a0e0000-0000-4000-8000-0000000000a2', '5a0e0000-0000-4000-8000-0000000000b1', 'generated', now() + interval '1 day' from msl_target
$$, '23514', null, 'a meeting link stays in its meeting workspace');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id)
  values ('meet/plain-link', 'https://example.com/', 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001', '5a0e0000-0000-4000-8000-0000000000a1')
$$, '23514', null, 'the meet/ prefix is reserved for meeting links');

select throws_ok($$
  update public.shortened_links set password_hash = 'x' where slug = 'msl-standup'
$$, '23514', null, 'meeting links cannot be password-locked');

select lives_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'msl-v' || n, b1, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b1', 'vanity', now() + interval '365 days'
  from msl_target, generate_series(1, 4) n
$$, 'staff can hold five vanity slugs per meeting');

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'msl-v6', b1, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000001', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b1', 'vanity', now() + interval '365 days' from msl_target
$$, '23514', null, 'the sixth vanity slug is refused');

select lives_ok($$
  insert into private.meet_short_link_audit (ws_id, meeting_id, actor_id, action, link_kind, slug)
  values ('5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-0000000000b1',
    '5a0e0000-0000-4000-8000-000000000001', 'create', 'vanity', 'msl-standup'),
    ('5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-0000000000b2',
    '5a0e0000-0000-4000-8000-000000000002', 'create', 'generated', 'meet/Ab3dE9x')
$$, 'the service records audit rows');

reset role;

-- A workspace member signs in.
select set_config('request.jwt.claims', json_build_object(
  'sub', '5a0e0000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '5a0e0000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok($$
  insert into public.shortened_links (slug, link, domain, creator_id, ws_id, meet_meeting_id, meet_link_kind, expires_at)
  select 'meet/Cl1ent00', b2, 'ttr.gg', '5a0e0000-0000-4000-8000-000000000002', '5a0e0000-0000-4000-8000-0000000000a1',
    '5a0e0000-0000-4000-8000-0000000000b2', 'generated', now() + interval '30 days' from msl_target
$$, '42501', null, 'clients cannot create meeting links directly');

update public.shortened_links set expires_at = now() + interval '10 years'
where meet_meeting_id = '5a0e0000-0000-4000-8000-0000000000b2';
delete from public.shortened_links where meet_meeting_id = '5a0e0000-0000-4000-8000-0000000000b2';

select throws_ok($$ select count(*) from private.meet_short_link_audit $$,
  '42501', null, 'clients cannot read the audit history');

select throws_ok($$
  insert into private.meet_short_link_audit (ws_id, meeting_id, actor_id, action, link_kind, slug)
  values ('5a0e0000-0000-4000-8000-0000000000a1', '5a0e0000-0000-4000-8000-0000000000b2',
    '5a0e0000-0000-4000-8000-000000000002', 'delete', 'generated', 'meet/Ab3dE9x')
$$, '42501', null, 'clients cannot write audit rows');

reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

select ok(
  (select expires_at < now() + interval '31 days' from public.shortened_links where slug = 'meet/Ab3dE9x'),
  'clients cannot extend a meeting link');
select is(
  (select count(*)::int from public.shortened_links where slug = 'meet/Ab3dE9x'),
  1, 'clients cannot delete a meeting link');

delete from public.workspace_meetings where id = '5a0e0000-0000-4000-8000-0000000000b1';
select is(
  (select count(*)::int from public.shortened_links where meet_meeting_id = '5a0e0000-0000-4000-8000-0000000000b1'
     or slug in ('msl-standup', 'Rt5oot1', 'msl-v1')),
  0, 'deleting the meeting removes its links');
select is(
  (select count(*)::int from private.meet_short_link_audit where meeting_id = '5a0e0000-0000-4000-8000-0000000000b1'),
  1, 'the audit history outlives the meeting');

select * from finish();
rollback;
