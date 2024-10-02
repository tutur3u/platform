drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (lower(wei.email) = lower(auth.email()))))));

CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Delete the invite
delete FROM public.workspace_invites i
WHERE i.ws_id = new.ws_id
  AND i.user_id = auth.uid();
delete FROM public.workspace_email_invites i
WHERE i.ws_id = new.ws_id
  AND lower(i.email) = lower(auth.email());
return new;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.sync_member_roles_from_invite() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$ begin -- Copy role and role_title from invite to new member
  new.role := coalesce(
    (
      SELECT wei.role
      FROM public.workspace_email_invites wei
      WHERE wei.ws_id = new.ws_id
        AND lower(wei.email) = lower(auth.email())
    ),(
      SELECT i.role
      FROM public.workspace_invites i
      WHERE i.ws_id = new.ws_id
        AND i.user_id = auth.uid()
    ),
    new.role,
    'MEMBER'::text
  );
new.role_title := coalesce(
  (
    SELECT wei.role_title
    FROM public.workspace_email_invites wei
    WHERE wei.ws_id = new.ws_id
      AND lower(wei.email) = lower(auth.email())
  ),
  (
    SELECT i.role_title
    FROM public.workspace_invites i
    WHERE i.ws_id = new.ws_id
      AND i.user_id = auth.uid()
  ),
  new.role_title,
  ''::text
);
return new;
end;
$function$
;

drop policy "Enable insert for invited members or workspace admins" on "public"."workspace_members";

create policy "Enable insert for invited members or workspace admins"
on "public"."workspace_members"
as permissive
for insert
to authenticated
with check ((is_member_invited(auth.uid(), ws_id) OR (is_org_member(auth.uid(), ws_id) AND ((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text))) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (lower(wei.email) = lower(auth.email()))))));

drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (lower(wei.email) = lower(auth.email())))) OR (creator_id = auth.uid())));

drop policy "Enable delete for organization members and current user" on "public"."workspace_email_invites";

create policy "Enable delete for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for delete
to authenticated
using (((lower(auth.email()) = lower(email)) OR is_org_member(auth.uid(), ws_id)));

drop policy "Enable read access for organization members and current user" on "public"."workspace_email_invites";

create policy "Enable read access for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for select
to authenticated
using (((lower(auth.email()) = lower(email)) OR is_org_member(auth.uid(), ws_id)));