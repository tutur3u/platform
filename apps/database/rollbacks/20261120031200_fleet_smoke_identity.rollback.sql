-- Disable the route first. Retire the identities and remove their Auth users
-- and workspaces through the approved fixture teardown. Roll back the limits
-- and sharing migration before removing the identity guards.
begin;
lock table private.fleet_smoke_operations, auth.users, public.users, public.workspaces in share row exclusive mode;
create temporary table fleet_smoke_rollback_guard (
  followup_removed boolean not null
    constraint roll_back_fleet_smoke_limits_first check (followup_removed),
  identities_removed boolean not null
    constraint remove_fleet_smoke_identities_before_rollback check (identities_removed)
) on commit drop;

insert into fleet_smoke_rollback_guard (followup_removed, identities_removed)
select not exists (
  select from pg_catalog.pg_trigger
  where not tgisinternal and (
    tgname = 'record_fleet_smoke_workspace'
    or (tgname like 'guard_fleet_smoke_%' and tgname not in (
      'guard_fleet_smoke_auth', 'guard_fleet_smoke_workspace',
      'guard_fleet_smoke_membership', 'guard_fleet_smoke_role_membership'
    ))
  )
), not exists (
  select from private.fleet_smoke_operations o join auth.users u on u.id = o.id
) and not exists (
  select from private.fleet_smoke_operations o join public.users u on u.id = o.id
) and not exists (
  select from private.fleet_smoke_operations o
  join public.workspaces w on w.id = o.workspace_id or w.creator_id = o.id
);

drop trigger guard_fleet_smoke_role_membership on public.workspace_role_members;
drop trigger guard_fleet_smoke_membership on public.workspace_members;
drop trigger guard_fleet_smoke_workspace on public.workspaces;
drop trigger guard_fleet_smoke_auth on auth.users;
drop function private.fleet_smoke_transition(uuid, text, uuid);
drop function private.guard_fleet_smoke_membership();
drop function private.guard_fleet_smoke_workspace();
drop function private.guard_fleet_smoke_auth();
drop table private.fleet_smoke_operations;
commit;
