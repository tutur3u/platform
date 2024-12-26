drop trigger if exists "delete_invite_when_accepted_tr" on "public"."org_members";

drop trigger if exists "add_org_creator_tr" on "public"."orgs";

drop policy "Enable delete for organization members and current user" on "public"."org_invites";

drop policy "Enable insert for organization members" on "public"."org_invites";

drop policy "Enable read access for organization members and current user" on "public"."org_invites";

drop policy "Enable delete for organization members" on "public"."org_members";

drop policy "Enable insert for invited members" on "public"."org_members";

drop policy "Enable read access for organization members" on "public"."org_members";

drop policy "Enable delete for users based on user_id" on "public"."orgs";

drop policy "Enable insert for authenticated users only" on "public"."orgs";

drop policy "Enable read access for organization members or invited members" on "public"."orgs";

drop policy "Enable update for all organization members" on "public"."orgs";

drop policy "Enable all access for organization members" on "public"."projects";

alter table "public"."org_invites" drop constraint "org_invites_org_id_fkey";

alter table "public"."org_invites" drop constraint "org_invites_user_id_fkey";

alter table "public"."org_members" drop constraint "org_members_org_id_fkey";

alter table "public"."org_members" drop constraint "org_members_user_id_fkey";

alter table "public"."projects" drop constraint "projects_org_id_fkey";

drop function if exists "public"."add_org_creator"();

alter table "public"."org_invites" drop constraint "org_invites_pkey";

alter table "public"."org_members" drop constraint "org_members_pkey";

alter table "public"."orgs" drop constraint "orgs_pkey";

drop index if exists "public"."org_invites_pkey";

drop index if exists "public"."org_members_pkey";

drop index if exists "public"."orgs_pkey";

drop table "public"."org_invites";

drop table "public"."org_members";

drop table "public"."orgs";

create table "public"."workspace_invites" (
    "ws_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."workspace_invites" enable row level security;

create table "public"."workspace_members" (
    "ws_id" uuid not null,
    "user_id" uuid not null default auth.uid(),
    "created_at" timestamp with time zone default now()
);


alter table "public"."workspace_members" enable row level security;

create table "public"."workspaces" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text,
    "created_at" timestamp with time zone default now(),
    "deleted" boolean default false
);


alter table "public"."workspaces" enable row level security;

alter table "public"."projects" drop column "org_id";

alter table "public"."projects" add column "ws_id" uuid;

CREATE UNIQUE INDEX org_invites_pkey ON public.workspace_invites USING btree (ws_id, user_id);

CREATE UNIQUE INDEX org_members_pkey ON public.workspace_members USING btree (ws_id, user_id);

CREATE UNIQUE INDEX orgs_pkey ON public.workspaces USING btree (id);

alter table "public"."workspace_invites" add constraint "org_invites_pkey" PRIMARY KEY using index "org_invites_pkey";

alter table "public"."workspace_members" add constraint "org_members_pkey" PRIMARY KEY using index "org_members_pkey";

alter table "public"."workspaces" add constraint "orgs_pkey" PRIMARY KEY using index "orgs_pkey";

alter table "public"."projects" add constraint "projects_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;

alter table "public"."projects" validate constraint "projects_ws_id_fkey";

alter table "public"."workspace_invites" add constraint "workspace_invites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."workspace_invites" validate constraint "workspace_invites_user_id_fkey";

alter table "public"."workspace_invites" add constraint "workspace_invites_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;

alter table "public"."workspace_invites" validate constraint "workspace_invites_ws_id_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_user_id_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_ws_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_ws_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  insert into public.workspace_members(org_id, user_id)
  values (new.id, auth.uid());
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$begin
delete FROM
  public.workspace_invites i
WHERE
  i.ws_id = new.ws_id
  AND i.user_id = new.user_id;
return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.is_member_invited(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM workspace_invites wsi
  WHERE wsi.ws_id = _org_id
  AND wsi.user_id = _user_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM workspace_members wsm
  WHERE wsm.ws_id = _org_id
  AND wsm.user_id = _user_id
);$function$
;

create policy "Enable delete for organization members and current user"
on "public"."workspace_invites"
as permissive
for delete
to authenticated
using (((auth.uid() = user_id) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable insert for organization members"
on "public"."workspace_invites"
as permissive
for insert
to authenticated
with check ((is_org_member(auth.uid(), ws_id) AND (NOT is_org_member(user_id, ws_id))));


create policy "Enable read access for organization members and current user"
on "public"."workspace_invites"
as permissive
for select
to authenticated
using (((auth.uid() = user_id) OR is_org_member(auth.uid(), ws_id)));


create policy "Enable delete for organization members"
on "public"."workspace_members"
as permissive
for delete
to authenticated
using (is_org_member(auth.uid(), ws_id));


create policy "Enable insert for invited members"
on "public"."workspace_members"
as permissive
for insert
to authenticated
with check (is_member_invited(auth.uid(), ws_id));


create policy "Enable read access for organization members"
on "public"."workspace_members"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));


create policy "Enable delete for users based on user_id"
on "public"."workspaces"
as permissive
for delete
to authenticated
using (((id <> '00000000-0000-0000-0000-000000000000'::uuid) AND (EXISTS ( SELECT workspace_members.user_id
   FROM workspace_members
  WHERE (auth.uid() = workspace_members.user_id)))));


create policy "Enable insert for authenticated users only"
on "public"."workspaces"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for organization members or invited members"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((is_org_member(auth.uid(), id) OR is_member_invited(auth.uid(), id)));


create policy "Enable update for all organization members"
on "public"."workspaces"
as permissive
for update
to authenticated
using ((EXISTS ( SELECT workspace_members.user_id
   FROM workspace_members
  WHERE (auth.uid() = workspace_members.user_id))))
with check ((EXISTS ( SELECT workspace_members.user_id
   FROM workspace_members
  WHERE (auth.uid() = workspace_members.user_id))));


create policy "Enable all access for organization members"
on "public"."projects"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));


CREATE TRIGGER delete_invite_when_accepted_tr AFTER INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION delete_invite_when_accepted();

CREATE TRIGGER add_ws_creator_tr AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION add_ws_creator();


