-- Document creator attribution. Authenticated writes on this table were revoked,
-- so this test restores the member grant and policy inside the rolled-back
-- transaction. A member cannot store or change owner_id. service_role may set
-- it on insert. Deleting the user still nulls the column.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    'b1900000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'document-owner-actor@example.com',
    now(),
    now(),
    now()
  ),
  (
    'b1900000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'document-owner-other@example.com',
    now(),
    now(),
    now()
  );
insert into public.users (id, display_name)
values
  ('b1900000-0000-4000-8000-000000000001', 'Document Actor'),
  ('b1900000-0000-4000-8000-000000000002', 'Document Other')
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values (
  'b1900000-0000-4000-8000-000000000010',
  'Document Owner Attribution',
  false,
  'b1900000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type)
values (
  'b1900000-0000-4000-8000-000000000010',
  'b1900000-0000-4000-8000-000000000001',
  'MEMBER'
)
on conflict (ws_id, user_id) do nothing;

select ok(
  not has_function_privilege(
    'authenticated',
    'private.workspace_documents_assign_owner()',
    'execute'
  ),
  'authenticated cannot call the owner trigger'
);

-- The description-table lock dropped the member policy and table grants.
-- Recreate that write path here so the trigger is what stops a forged owner.
grant select, insert, update on table public.workspace_documents to authenticated;
grant select, insert, update on table public.workspace_documents to service_role;
create policy workspace_documents_owner_attribution_test
on public.workspace_documents
as permissive
for all
to authenticated
using (public.is_org_member(auth.uid(), ws_id))
with check (public.is_org_member(auth.uid(), ws_id));

select set_config(
  'request.jwt.claims',
  '{"sub":"b1900000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'b1900000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  auth.uid(),
  'b1900000-0000-4000-8000-000000000001'::uuid,
  'the member session resolves auth.uid()'
);
select ok(
  public.is_org_member(
    auth.uid(),
    'b1900000-0000-4000-8000-000000000010'
  ),
  'the member policy sees this workspace membership'
);

insert into public.workspace_documents (id, ws_id, name, owner_id)
values (
  'b1900000-0000-4000-8000-000000000021',
  'b1900000-0000-4000-8000-000000000010',
  'Forged insert',
  'b1900000-0000-4000-8000-000000000002'
);

select is(
  (
    select owner_id
    from public.workspace_documents
    where id = 'b1900000-0000-4000-8000-000000000021'
  ),
  'b1900000-0000-4000-8000-000000000001'::uuid,
  'a member insert stores auth.uid() instead of a forged owner'
);

select throws_ok(
  $$update public.workspace_documents
    set owner_id = 'b1900000-0000-4000-8000-000000000002'
    where id = 'b1900000-0000-4000-8000-000000000021'$$,
  '42501',
  'owner_id cannot be changed',
  'a member cannot change the document owner'
);

select throws_ok(
  $$update public.workspace_documents
    set owner_id = null
    where id = 'b1900000-0000-4000-8000-000000000021'$$,
  '42501',
  'owner_id cannot be changed',
  'a member cannot clear the document owner'
);

select is(
  (
    select owner_id
    from public.workspace_documents
    where id = 'b1900000-0000-4000-8000-000000000021'
  ),
  'b1900000-0000-4000-8000-000000000001'::uuid,
  'a rejected owner update leaves the creator in place'
);

update public.workspace_documents
set name = 'Renamed'
where id = 'b1900000-0000-4000-8000-000000000021';

select is(
  (
    select name || ':' || owner_id::text
    from public.workspace_documents
    where id = 'b1900000-0000-4000-8000-000000000021'
  ),
  'Renamed:b1900000-0000-4000-8000-000000000001',
  'editing a document does not change its owner'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

insert into public.workspace_documents (id, ws_id, name, owner_id)
values (
  'b1900000-0000-4000-8000-000000000022',
  'b1900000-0000-4000-8000-000000000010',
  'Service insert',
  'b1900000-0000-4000-8000-000000000002'
);

select is(
  (
    select owner_id
    from public.workspace_documents
    where id = 'b1900000-0000-4000-8000-000000000022'
  ),
  'b1900000-0000-4000-8000-000000000002'::uuid,
  'service_role may set the creator explicitly'
);

select throws_ok(
  $$update public.workspace_documents
    set owner_id = 'b1900000-0000-4000-8000-000000000001'
    where id = 'b1900000-0000-4000-8000-000000000022'$$,
  '42501',
  'owner_id cannot be changed',
  'service_role cannot reassign the creator later'
);

reset role;

-- Signup creates a personal workspace. Its guard allows deletion only after
-- the auth user is gone, and the workspace itself blocks deleting that user.
-- Disable the guard inside this rolled-back test, then delete the account.
alter table public.workspaces
  disable trigger trg_prevent_personal_workspace_deletion;
delete from public.workspace_members
where user_id = 'b1900000-0000-4000-8000-000000000002';
delete from public.workspaces
where personal
  and creator_id = 'b1900000-0000-4000-8000-000000000002';
delete from public.users
where id = 'b1900000-0000-4000-8000-000000000002';

select is(
  (
    select owner_id
    from public.workspace_documents
    where id = 'b1900000-0000-4000-8000-000000000022'
  ),
  null,
  'deleting the user still nulls owner_id'
);

select is(
  (
    select owner_id
    from public.workspace_documents
    where id = 'b1900000-0000-4000-8000-000000000021'
  ),
  'b1900000-0000-4000-8000-000000000001'::uuid,
  'deleting another user leaves this document owner'
);

select * from finish();
rollback;
