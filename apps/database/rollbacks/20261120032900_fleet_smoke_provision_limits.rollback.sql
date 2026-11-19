begin;
lock table private.fleet_smoke_operations, auth.users, public.users, public.workspaces in share row exclusive mode;
create temporary table fleet_smoke_rollback_guard (
  identities_removed boolean not null
    constraint remove_fleet_smoke_identities_before_rollback check (identities_removed)
) on commit drop;

insert into fleet_smoke_rollback_guard (identities_removed)
select not exists (
  select from private.fleet_smoke_operations o join auth.users u on u.id = o.id
) and not exists (
  select from private.fleet_smoke_operations o join public.users u on u.id = o.id
) and not exists (
  select from private.fleet_smoke_operations o
  join public.workspaces w on w.id = o.workspace_id or w.creator_id = o.id
);

drop trigger guard_fleet_smoke_task_shares on public.task_shares;
drop trigger guard_fleet_smoke_task_board_shares on public.task_board_shares;
drop trigger guard_fleet_smoke_board_template_shares on public.board_template_shares;
drop trigger guard_fleet_smoke_task_share_links on public.task_share_links;
drop trigger guard_fleet_smoke_form_share_links on private.form_share_links;
drop trigger guard_fleet_smoke_task_plan_shares on public.task_plan_shares;
drop trigger guard_fleet_smoke_invites on public.workspace_invites;
drop trigger guard_fleet_smoke_invite_links on public.workspace_invite_links;
drop trigger guard_fleet_smoke_email_invites on public.workspace_email_invites;
drop trigger record_fleet_smoke_workspace on public.workspaces;
drop trigger guard_fleet_smoke_provision_limit on private.fleet_smoke_operations;
drop function private.guard_fleet_smoke_sharing();
drop function private.record_fleet_smoke_workspace();
drop function private.guard_fleet_smoke_provision_limit();
drop trigger guard_fleet_smoke_purge on private.fleet_smoke_operations;
drop function private.guard_fleet_smoke_purge();
alter table private.fleet_smoke_operations drop column purged_at;
commit;
