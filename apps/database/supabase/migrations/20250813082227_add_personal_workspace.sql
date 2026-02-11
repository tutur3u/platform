alter table "public"."workspaces" add column "personal" boolean not null default false;

create unique index one_personal_workspace_per_creator on public.workspaces (creator_id) where personal = true;

-- Helper function: check if a given workspace is personal
set check_function_bodies = off;

create or replace function public.is_personal_workspace(p_ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (select personal from public.workspaces where id = p_ws_id),
    false
  );
$function$;

comment on function public.is_personal_workspace(uuid)
  is 'Returns true if the workspace with the given id is marked as personal; false otherwise.';

-- Helper function: check if a given user is the creator/owner of a workspace
create or replace function public.is_workspace_owner(p_ws_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_ws_id
      and w.creator_id = p_user_id
  );
$function$;

comment on function public.is_workspace_owner(uuid, uuid)
  is 'Returns true if p_user_id is the creator of workspace p_ws_id; false otherwise.';

-- Helper function: get the number of members in a workspace
create or replace function public.get_workspace_member_count(p_ws_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (
      select count(*)::int
      from public.workspace_members wm
      where wm.ws_id = p_ws_id
    ),
    0
  );
$function$;

comment on function public.get_workspace_member_count(uuid)
  is 'Returns the number of rows in workspace_members for the given workspace id.';

-- RLS policy updates related to personal workspaces

-- Helper: check if user can create a workspace without causing RLS recursion
create or replace function public.can_create_workspace(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select (
    exists (
      select 1 from public.workspaces w
      where w.creator_id = p_user_id
    )
  ) OR (
    exists (
      select 1 from public.platform_user_roles pur
      where pur.user_id = p_user_id
        and pur.allow_workspace_creation = true
    )
  );
$function$;

grant execute on function public.can_create_workspace(uuid) to authenticated;

-- Update workspaces INSERT policy to use helper function (avoid self-select recursion)
drop policy if exists "Enable insert for authenticated users only" on "public"."workspaces";

create policy "Enable insert with creator and creation permission check"
on "public"."workspaces"
as permissive
for insert
to authenticated
with check (((creator_id = auth.uid()) AND can_create_workspace(auth.uid())));

-- Update workspaces UPDATE policy to respect personal workspaces and roles/invites
drop policy if exists "Enable update for all organization members" on "public"."workspaces";

create policy "Enable update respecting personal workspace and roles"
on "public"."workspaces"
as permissive
for update
to authenticated
using (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND ((get_user_role(auth.uid(), id) = 'OWNER'::text) OR (get_user_role(auth.uid(), id) = 'ADMIN'::text)) AND ((personal = false) OR (is_workspace_owner(id, auth.uid()) AND (get_workspace_member_count(id) = 1) AND (( SELECT count(*) AS count
   FROM workspaces wss
  WHERE (wss.personal = true) AND (wss.creator_id = auth.uid())) < 1)))))
with check (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND ((get_user_role(auth.uid(), id) = 'OWNER'::text) OR (get_user_role(auth.uid(), id) = 'ADMIN'::text)) AND ((personal = false) OR (is_workspace_owner(id, auth.uid()) AND (get_workspace_member_count(id) = 1) AND (( SELECT count(*) AS count
   FROM workspaces wss
  WHERE (wss.personal = true) AND (wss.creator_id = auth.uid())) < 1)))));

-- Update workspace_members INSERT policy to enforce personal workspace constraints
drop policy if exists "Enable insert for invited members or workspace admins" on "public"."workspace_members";

create policy "Enable insert with personal workspace constraints"
on "public"."workspace_members"
as permissive
for insert
to authenticated
with check ((((is_personal_workspace(ws_id) = false) OR is_workspace_owner(ws_id, auth.uid())) AND (is_member_invited(auth.uid(), ws_id) OR (is_org_member(auth.uid(), ws_id) AND ((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text))) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (lower(wei.email) = lower(auth.email())))))));

set check_function_bodies = on;