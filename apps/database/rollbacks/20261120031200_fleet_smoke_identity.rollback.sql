-- Disable the route first. Retire the identities and remove their Auth users
-- through the approved fixture teardown before removing their isolation guards.
begin;
lock table private.fleet_smoke_operations, auth.users, public.users in share row exclusive mode;
create temporary table fleet_smoke_rollback_guard (
  identities_removed boolean not null
    constraint remove_fleet_smoke_identities_before_rollback check (identities_removed)
) on commit drop;

insert into fleet_smoke_rollback_guard (identities_removed)
select not exists (
  select from private.fleet_smoke_operations o join auth.users u on u.id = o.id
) and not exists (
  select from private.fleet_smoke_operations o join public.users u on u.id = o.id
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
