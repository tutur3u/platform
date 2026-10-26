-- Contract for 20261026100000_least_privilege_workspace_storage_rls.sql:
-- every root of the `workspaces` bucket (including the Drive private upload
-- census roots and the spaced `AI Agent Imports` root) x {non-member, member, view_drive,
-- manage_drive, chat owner/uploader, service_role} x {select, insert,
-- update, delete}. Each probe runs in a subtransaction that is always rolled
-- back, so probes never affect each other.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(368);

-- Actors: creator (seed only), member, viewer, manager, owner, non-member.
insert into auth.users (id) values
  ('5707a6e0-0000-4000-8000-000000009701'),
  ('5707a6e0-0000-4000-8000-000000009702'),
  ('5707a6e0-0000-4000-8000-000000009703'),
  ('5707a6e0-0000-4000-8000-000000009704'),
  ('5707a6e0-0000-4000-8000-000000009705'),
  ('5707a6e0-0000-4000-8000-000000009706');
insert into public.users (id)
select id from auth.users where id::text like '5707a6e0-0000-4000-8000-0000000097__'
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('5707a6e0-0000-4000-8000-000000009711', 'Storage RLS test', false,
  '5707a6e0-0000-4000-8000-000000009701');
insert into public.workspace_members (ws_id, user_id, type) values
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009701', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009702', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009703', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009704', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009705', 'MEMBER')
on conflict do nothing;
-- Member defaults would grant admin/view_drive to everyone; use explicit roles.
delete from public.workspace_default_permissions
where ws_id = '5707a6e0-0000-4000-8000-000000009711';
insert into public.workspace_roles (id, name, ws_id) values
  ('5707a6e0-0000-4000-8000-000000009731', 'Drive viewer', '5707a6e0-0000-4000-8000-000000009711'),
  ('5707a6e0-0000-4000-8000-000000009732', 'Drive manager', '5707a6e0-0000-4000-8000-000000009711');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009731', 'view_drive', true),
  ('5707a6e0-0000-4000-8000-000000009711', '5707a6e0-0000-4000-8000-000000009732', 'manage_drive', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('5707a6e0-0000-4000-8000-000000009731', '5707a6e0-0000-4000-8000-000000009703'),
  ('5707a6e0-0000-4000-8000-000000009732', '5707a6e0-0000-4000-8000-000000009704');
-- Chat X belongs to the owner (9705); chat Y belongs to the member (9702).
insert into public.ai_chats (id, creator_id) values
  ('5707a6e0-0000-4000-8000-000000009721', '5707a6e0-0000-4000-8000-000000009705'),
  ('5707a6e0-0000-4000-8000-000000009722', '5707a6e0-0000-4000-8000-000000009702');

create temp table storage_rls_objects (key text primary key, name text not null)
on commit drop;
insert into storage_rls_objects values
  ('drive_root', '5707a6e0-0000-4000-8000-000000009711/drive.txt'),
  ('drive_folder', '5707a6e0-0000-4000-8000-000000009711/docs/report.pdf'),
  ('chat_owner', '5707a6e0-0000-4000-8000-000000009711/chat/5707a6e0-0000-4000-8000-000000009721/a.png'),
  ('chat_other', '5707a6e0-0000-4000-8000-000000009711/chat/5707a6e0-0000-4000-8000-000000009722/b.png'),
  ('chats_owner', '5707a6e0-0000-4000-8000-000000009711/chats/ai/resources/5707a6e0-0000-4000-8000-000000009721/c.pdf'),
  ('chats_temp', '5707a6e0-0000-4000-8000-000000009711/chats/ai/resources/temp/5707a6e0-0000-4000-8000-000000009705/d.pdf'),
  ('chats_other', '5707a6e0-0000-4000-8000-000000009711/chats/conversations/e.bin'),
  ('external_apps', '5707a6e0-0000-4000-8000-000000009711/external-apps/app/chat/conv/att'),
  ('reserved', '5707a6e0-0000-4000-8000-000000009711/.tuturuuu/mobile-deployment-vault/v/app.ipa'),
  ('recordings', '5707a6e0-0000-4000-8000-000000009711/recordings/m/s/r.webm'),
  ('project_updates', '5707a6e0-0000-4000-8000-000000009711/project-updates/u/p.png'),
  ('template_bg', '5707a6e0-0000-4000-8000-000000009711/template-backgrounds/t.png'),
  ('ai_agent_imports', '5707a6e0-0000-4000-8000-000000009711/AI Agent Imports/discord/channel/thread/g.png'),
  ('mira_images', '5707a6e0-0000-4000-8000-000000009711/mira/images/h.png'),
  ('drive_mira_qr', '5707a6e0-0000-4000-8000-000000009711/drive/mira/qr/q.png');
insert into storage.objects (bucket_id, name)
select 'workspaces', name from storage_rls_objects
union all
select 'workspaces', '5707a6e0-0000-4000-8000-000000009711/ai agent imports/discord/c/t/x.png'
union all
select 'workspaces', '5707a6e0-0000-4000-8000-000000009711/CHATS/ai/resources/5707a6e0-0000-4000-8000-000000009721/c.pdf';

-- Expected access as select/insert/update/delete flags (S, I, U, D or -).
create temp table storage_rls_expected (actor text, key text, flags text)
on commit drop;
insert into storage_rls_expected
select a.actor, o.key,
  case
    when a.actor = 'service' then 'SIUD'
    when a.actor = 'nonmember' then '----'
    when o.key = 'project_updates' then 'SIUD'
    when o.key in ('drive_root', 'drive_folder', 'drive_mira_qr') then
      case a.actor when 'manager' then 'SIUD' when 'viewer' then 'S---' else '----' end
    when o.key = 'template_bg' then
      case a.actor when 'manager' then 'SIUD' else 'S---' end
    when o.key in ('chat_owner', 'chats_owner', 'chats_temp') then
      case a.actor when 'owner' then 'S--D' else '----' end
    when o.key = 'chat_other' then
      case a.actor when 'member' then 'S--D' else '----' end
    else '----'
  end
from (values ('nonmember'), ('member'), ('viewer'), ('manager'), ('owner'), ('service')) as a(actor)
cross join storage_rls_objects o;

create function pg_temp.storage_rls_actor_id(p_actor text) returns uuid
language sql immutable as $$
  select case p_actor
    when 'member' then '5707a6e0-0000-4000-8000-000000009702'
    when 'viewer' then '5707a6e0-0000-4000-8000-000000009703'
    when 'manager' then '5707a6e0-0000-4000-8000-000000009704'
    when 'owner' then '5707a6e0-0000-4000-8000-000000009705'
    when 'nonmember' then '5707a6e0-0000-4000-8000-000000009706'
  end::uuid
$$;

create function pg_temp.storage_rls_can(p_actor text, p_op text, p_name text)
returns boolean language plpgsql as $$
declare
  v_ok boolean := false;
  v_rows bigint;
begin
  begin
    if p_actor = 'service' then
      perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
      set local role service_role;
    else
      perform set_config('request.jwt.claims', json_build_object(
        'sub', pg_temp.storage_rls_actor_id(p_actor), 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
    perform set_config('storage.allow_delete_query', 'true', true);

    if p_op = 'select' then
      select count(*) into v_rows from storage.objects
      where bucket_id = 'workspaces' and name = p_name;
    elsif p_op = 'insert' then
      insert into storage.objects (bucket_id, name)
      values ('workspaces', p_name || '.new');
      v_rows := 1;
    elsif p_op = 'update' then
      update storage.objects set metadata = coalesce(metadata, '{}'::jsonb)
      where bucket_id = 'workspaces' and name = p_name;
      get diagnostics v_rows = row_count;
    else
      delete from storage.objects
      where bucket_id = 'workspaces' and name = p_name;
      get diagnostics v_rows = row_count;
    end if;
    v_ok := v_rows > 0;
    raise exception 'storage_rls_probe_rollback';
  exception
    when insufficient_privilege then v_ok := false;
    when raise_exception then
      if sqlerrm <> 'storage_rls_probe_rollback' then raise; end if;
  end;
  return v_ok;
end;
$$;

-- Structure (1-8).
select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'Allow workspace members to % workspace folder'), 0,
  'broad workspace-member storage policies are removed');
select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'workspace_storage_%' and permissive = 'PERMISSIVE'), 4,
  'four path-scoped permissive policies exist');
select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'workspace_storage_guard_%' and permissive = 'RESTRICTIVE'), 4,
  'four restrictive guards exist');
select ok(not has_function_privilege('anon',
  'public.workspace_storage_object_access(text,text)', 'EXECUTE'),
  'anon cannot call the storage access helper');
select is((select proconfig::text from pg_proc
  where oid = 'public.workspace_storage_object_access(text,text)'::regprocedure),
  '{"search_path=pg_catalog, pg_temp"}', 'storage access helper pins search_path');
select ok(not pg_temp.storage_rls_can('manager', 'insert',
  '5707a6e0-0000-4000-8000-000000009711/docs/../chats/x'),
  'traversal segments are rejected even for a Drive manager');
select ok(not pg_temp.storage_rls_can('manager', 'select',
  '5707a6e0-0000-4000-8000-000000009711/ai agent imports/discord/c/t/x.png'),
  'the spaced AI Agent Imports root matches case-insensitively');
select ok(not pg_temp.storage_rls_can('manager', 'select',
  '5707a6e0-0000-4000-8000-000000009711/CHATS/ai/resources/5707a6e0-0000-4000-8000-000000009721/c.pdf'),
  'private roots match case-insensitively (no Drive fallback)');

-- Matrix (9-368): 6 actors x 15 objects x 4 operations.
select is(
  pg_temp.storage_rls_can(e.actor, op.name, o.name),
  position(op.flag in e.flags) > 0,
  format('%s %s %s', e.actor, op.name, o.key)
)
from storage_rls_expected e
join storage_rls_objects o using (key)
cross join (values ('select', 'S', 1), ('insert', 'I', 2), ('update', 'U', 3), ('delete', 'D', 4))
  as op(name, flag, ord)
order by e.actor, o.key, op.ord;

select * from finish();
rollback;
