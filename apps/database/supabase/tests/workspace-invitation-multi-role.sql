begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_table(
  'public',
  'workspace_invite_roles',
  'direct invitations have a multi-role join table'
);
select has_table(
  'public',
  'workspace_email_invite_roles',
  'email invitations have a multi-role join table'
);
select has_function(
  'private',
  'set_workspace_invitation_roles',
  array['uuid', 'uuid[]', 'uuid', 'text'],
  'pending invitation roles can be replaced atomically'
);
select has_function(
  'private',
  'finalize_workspace_invitation_membership_v2',
  array['uuid', 'uuid', 'workspace_member_type', 'uuid[]'],
  'invitation acceptance supports multiple roles'
);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-000000009101'),
  ('00000000-0000-0000-0000-000000009102')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000009110',
  'Multi-role invitation test',
  false,
  '00000000-0000-0000-0000-000000009101'
)
on conflict (id) do nothing;

insert into public.workspace_roles (id, ws_id, name)
values
  (
    '00000000-0000-0000-0000-000000009121',
    '00000000-0000-0000-0000-000000009110',
    'Editors'
  ),
  (
    '00000000-0000-0000-0000-000000009122',
    '00000000-0000-0000-0000-000000009110',
    'Reviewers'
  )
on conflict (id) do nothing;

select lives_ok(
  $$
    select private.create_workspace_email_invitation_with_roles(
      '00000000-0000-0000-0000-000000009110',
      'PENDING@EXAMPLE.COM',
      '00000000-0000-0000-0000-000000009101',
      'MEMBER',
      array[
        '00000000-0000-0000-0000-000000009121'::uuid,
        '00000000-0000-0000-0000-000000009122'::uuid
      ]
    )
  $$,
  'email invitations can be created with multiple roles'
);

select is(
  (
    select count(*)::integer
    from public.workspace_email_invite_roles
    where ws_id = '00000000-0000-0000-0000-000000009110'
      and email = 'pending@example.com'
  ),
  2,
  'both pending invitation roles are stored'
);

select results_eq(
  $$
    select unnest(private.get_workspace_invitation_role_ids(
      '00000000-0000-0000-0000-000000009110',
      null,
      'PENDING@EXAMPLE.COM'
    ))
  $$,
  $$
    values
      ('00000000-0000-0000-0000-000000009121'::uuid),
      ('00000000-0000-0000-0000-000000009122'::uuid)
  $$,
  'all pending roles are returned in a stable order'
);

select lives_ok(
  $$
    select private.finalize_workspace_invitation_membership_v2(
      '00000000-0000-0000-0000-000000009110',
      '00000000-0000-0000-0000-000000009102',
      'MEMBER',
      array[
        '00000000-0000-0000-0000-000000009121'::uuid,
        '00000000-0000-0000-0000-000000009122'::uuid
      ]
    )
  $$,
  'accepting an invitation finalizes every assigned role'
);

select is(
  (
    select type
    from public.workspace_members
    where ws_id = '00000000-0000-0000-0000-000000009110'
      and user_id = '00000000-0000-0000-0000-000000009102'
  ),
  'MEMBER'::public.workspace_member_type,
  'acceptance creates the requested workspace membership'
);

select is(
  (
    select count(*)::integer
    from public.workspace_role_members
    where user_id = '00000000-0000-0000-0000-000000009102'
      and role_id in (
        '00000000-0000-0000-0000-000000009121',
        '00000000-0000-0000-0000-000000009122'
      )
  ),
  2,
  'acceptance assigns every pending workspace role'
);

select throws_ok(
  $$
    select private.set_workspace_invitation_roles(
      '00000000-0000-0000-0000-000000009110',
      array['00000000-0000-0000-0000-000000009121'::uuid],
      null,
      'missing@example.com'
    )
  $$,
  'P0002',
  'Pending workspace invitation not found',
  'roles cannot be assigned to a missing invitation'
);

select * from finish();
rollback;
