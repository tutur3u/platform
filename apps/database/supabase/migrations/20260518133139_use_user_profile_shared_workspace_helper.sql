create or replace function public.current_user_shares_workspace_with(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select auth.uid()) is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.workspace_members viewer_member
      join public.workspace_members target_member
        on target_member.ws_id = viewer_member.ws_id
      where viewer_member.user_id = (select auth.uid())
        and target_member.user_id = target_user_id
    );
$$;

comment on function public.current_user_shares_workspace_with(uuid) is
'Checks shared workspace membership for public profile RLS without evaluating workspace_members under caller RLS.';

revoke all on function public.current_user_shares_workspace_with(uuid) from public;
revoke all on function public.current_user_shares_workspace_with(uuid) from anon;
grant execute on function public.current_user_shares_workspace_with(uuid) to authenticated;
grant execute on function public.current_user_shares_workspace_with(uuid) to service_role;

drop policy if exists "Enable read access for current user and workspace members" on "public"."users";
drop policy if exists "Enable read access for current user and workspace users" on "public"."user_private_details";

create policy "Enable read access for current user and workspace members"
on "public"."users"
as permissive
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    id = (select auth.uid())
    or public.current_user_shares_workspace_with("users".id)
  )
);

comment on policy "Enable read access for current user and workspace members"
on "public"."users" is
'Prevents authenticated Data API callers from enumerating every platform user while preserving self-profile and shared-workspace profile lookups.';

create policy "Enable read access for current user and workspace users"
on "public"."user_private_details"
as permissive
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    user_id = (select auth.uid())
    or public.current_user_shares_workspace_with("user_private_details".user_id)
  )
);

comment on policy "Enable read access for current user and workspace users"
on "public"."user_private_details" is
'Allows private profile reads only for the signed-in user or users who share a workspace with the signed-in user.';
