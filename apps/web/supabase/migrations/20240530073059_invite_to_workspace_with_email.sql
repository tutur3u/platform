create table "public"."workspace_email_invites" (
    "ws_id" uuid not null,
    "email" text not null,
    "role" text not null default '''MEMBER''::text'::text,
    "role_title" text not null default ''::text,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."workspace_email_invites" enable row level security;

CREATE UNIQUE INDEX workspace_email_invites_pkey ON public.workspace_email_invites USING btree (ws_id, email);

alter table "public"."workspace_email_invites" add constraint "workspace_email_invites_pkey" PRIMARY KEY using index "workspace_email_invites_pkey";

alter table "public"."workspace_email_invites" add constraint "workspace_email_invites_role_fkey" FOREIGN KEY (role) REFERENCES workspace_default_roles(id) ON UPDATE CASCADE not valid;

alter table "public"."workspace_email_invites" validate constraint "workspace_email_invites_role_fkey";

alter table "public"."workspace_email_invites" add constraint "workspace_email_invites_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_email_invites" validate constraint "workspace_email_invites_ws_id_fkey";

create or replace view "public"."workspace_members_and_invites" as  SELECT wi.ws_id,
    u.id,
    u.handle,
    NULL::text AS email,
    u.display_name,
    u.avatar_url,
    COALESCE(wm.role, wi.role) AS role,
    COALESCE(wm.role_title, wi.role_title) AS role_title,
    COALESCE(wm.created_at, wi.created_at) AS created_at,
    (wm.user_id IS NULL) AS pending
   FROM ((workspace_invites wi
     LEFT JOIN workspace_members wm ON (((wi.user_id = wm.user_id) AND (wi.ws_id = wm.ws_id))))
     JOIN users u ON ((wi.user_id = u.id)))
UNION
 SELECT wm.ws_id,
    wm.user_id AS id,
    u.handle,
    upd.email,
    u.display_name,
    u.avatar_url,
    wm.role,
    wm.role_title,
    wm.created_at,
    false AS pending
   FROM ((workspace_members wm
     JOIN users u ON ((wm.user_id = u.id)))
     JOIN user_private_details upd ON ((upd.user_id = u.id)))
UNION
 SELECT wei.ws_id,
    NULL::uuid AS id,
    NULL::text AS handle,
    wei.email,
    NULL::text AS display_name,
    NULL::text AS avatar_url,
    wei.role,
    wei.role_title,
    wei.created_at,
    true AS pending
   FROM workspace_email_invites wei;


grant delete on table "public"."workspace_email_invites" to "anon";

grant insert on table "public"."workspace_email_invites" to "anon";

grant references on table "public"."workspace_email_invites" to "anon";

grant select on table "public"."workspace_email_invites" to "anon";

grant trigger on table "public"."workspace_email_invites" to "anon";

grant truncate on table "public"."workspace_email_invites" to "anon";

grant update on table "public"."workspace_email_invites" to "anon";

grant delete on table "public"."workspace_email_invites" to "authenticated";

grant insert on table "public"."workspace_email_invites" to "authenticated";

grant references on table "public"."workspace_email_invites" to "authenticated";

grant select on table "public"."workspace_email_invites" to "authenticated";

grant trigger on table "public"."workspace_email_invites" to "authenticated";

grant truncate on table "public"."workspace_email_invites" to "authenticated";

grant update on table "public"."workspace_email_invites" to "authenticated";

grant delete on table "public"."workspace_email_invites" to "service_role";

grant insert on table "public"."workspace_email_invites" to "service_role";

grant references on table "public"."workspace_email_invites" to "service_role";

grant select on table "public"."workspace_email_invites" to "service_role";

grant trigger on table "public"."workspace_email_invites" to "service_role";

grant truncate on table "public"."workspace_email_invites" to "service_role";

grant update on table "public"."workspace_email_invites" to "service_role";

create policy "Allow update for workspace members"
on "public"."workspace_email_invites"
as permissive
for update
to authenticated
using ((((((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) AND (role <> 'OWNER'::text)) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)) AND is_org_member(auth.uid(), ws_id)) OR ((email = auth.email()) AND (get_user_role(auth.uid(), ws_id) = role))))
with check ((((((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) AND (role <> 'OWNER'::text)) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)) AND is_org_member(auth.uid(), ws_id)) OR ((email = auth.email()) AND (get_user_role(auth.uid(), ws_id) = role))));


create policy "Enable delete for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for delete
to authenticated
using (((auth.email() = email) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable insert for workspace members"
on "public"."workspace_email_invites"
as permissive
for insert
to authenticated
with check ((is_org_member(auth.uid(), ws_id) AND (NOT (EXISTS ( SELECT 1
   FROM workspace_secrets wss
  WHERE ((wss.ws_id = workspace_email_invites.ws_id) AND (wss.name = 'DISABLE_INVITE'::text)))))));


create policy "Enable read access for organization members and current user"
on "public"."workspace_email_invites"
as permissive
for select
to authenticated
using (((auth.email() = email) OR is_org_member(auth.uid(), ws_id)));

drop policy "Enable read access for organization members or invited members" on "public"."workspaces";

create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM workspace_email_invites wei
  WHERE (wei.email = auth.email())))));

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
  AND i.email = auth.email();
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
        AND wei.email = auth.email()
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
      AND wei.email = auth.email()
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
  WHERE (wei.email = auth.email())))));