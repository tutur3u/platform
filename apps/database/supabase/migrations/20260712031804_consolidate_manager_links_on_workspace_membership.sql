-- A manager profile can be assigned before its platform account joins the
-- workspace (for example, while an invitation is pending). Re-run the same
-- deterministic consolidation when membership arrives so no manual repair is
-- needed. The underlying helper still rejects missing or ambiguous matches.

create or replace function private.consolidate_user_group_manager_links_on_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_email text;
  manager_record record;
begin
  select nullif(lower(btrim(private_details.email)), '')
  into v_email
  from public.user_private_details private_details
  where private_details.user_id = new.user_id;

  if v_email is null then
    return new;
  end if;

  for manager_record in
    select distinct manager_membership.user_id
    from public.workspace_user_groups_users manager_membership
    inner join public.workspace_user_groups user_group
      on user_group.id = manager_membership.group_id
    inner join public.workspace_users workspace_user
      on workspace_user.id = manager_membership.user_id
      and workspace_user.ws_id = user_group.ws_id
    where user_group.ws_id = new.ws_id
      and manager_membership.role = 'TEACHER'
      and nullif(lower(btrim(workspace_user.email)), '') = v_email
  loop
    perform private.consolidate_user_group_manager_link(
      manager_record.user_id,
      new.ws_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.consolidate_user_group_manager_links_on_membership()
from public, anon, authenticated, service_role;

drop trigger if exists consolidate_user_group_manager_links_on_membership
on public.workspace_members;

create trigger consolidate_user_group_manager_links_on_membership
after insert or update of ws_id, user_id
on public.workspace_members
for each row
execute function private.consolidate_user_group_manager_links_on_membership();
