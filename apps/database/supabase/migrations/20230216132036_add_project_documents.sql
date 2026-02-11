create table "public"."project_documents" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "name" text default ''::text,
    "content" text default ''::text,
    "created_at" timestamp with time zone default now()
);


alter table "public"."project_documents" enable row level security;

alter table "public"."project_wallets" enable row level security;

CREATE UNIQUE INDEX project_documents_pkey ON public.project_documents USING btree (id);

alter table "public"."project_documents" add constraint "project_documents_pkey" PRIMARY KEY using index "project_documents_pkey";

alter table "public"."project_documents" add constraint "project_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) not valid;

alter table "public"."project_documents" validate constraint "project_documents_project_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM projects
  WHERE id = _project_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM org_members om
  WHERE om.org_id = _org_id
  AND om.user_id = _user_id
);$function$
;

create policy "Enable all access for project members"
on "public"."project_documents"
as permissive
for all
to authenticated
using (is_project_member(project_id))
with check (is_project_member(project_id));


create policy "Enable all access for project members"
on "public"."project_wallets"
as permissive
for all
to authenticated
using (is_project_member(project_id))
with check (is_project_member(project_id));



