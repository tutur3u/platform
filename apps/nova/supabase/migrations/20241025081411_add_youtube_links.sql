alter table "public"."workspace_course_modules" drop constraint "workspace_course_modules_pkey";

drop index if exists "public"."workspace_course_modules_pkey";

alter table "public"."workspace_course_modules" drop column "id";

alter table "public"."workspace_course_modules" add column "course_id" uuid not null;

alter table "public"."workspace_course_modules" add constraint "workspace_course_modules_course_id_fkey" FOREIGN KEY (course_id) REFERENCES workspace_courses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_course_modules" validate constraint "workspace_course_modules_course_id_fkey";

alter table "public"."workspace_course_modules" add column "id" uuid not null;

CREATE UNIQUE INDEX workspace_course_modules_id_key ON public.workspace_course_modules USING btree (id);

CREATE UNIQUE INDEX workspace_course_modules_pkey ON public.workspace_course_modules USING btree (id);

alter table "public"."workspace_course_modules" add constraint "workspace_course_modules_pkey" PRIMARY KEY using index "workspace_course_modules_pkey";

alter table "public"."workspace_course_modules" add constraint "workspace_course_modules_id_key" UNIQUE using index "workspace_course_modules_id_key";

alter table "public"."workspace_course_modules" add column "content" jsonb;

alter table "public"."workspace_course_modules" add column "extra_content" jsonb;

alter table "public"."workspace_course_modules" add column "youtube_links" text[];

alter table "public"."workspace_course_modules" alter column "id" set default gen_random_uuid();

alter table "public"."workspace_courses" drop column "extra_content";

alter table "public"."workspace_courses" drop column "objectives";

create policy "Allow all access for workspace member"
on "public"."workspace_course_modules"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_courses wc
  WHERE (wc.id = workspace_course_modules.course_id))))
with check ((EXISTS ( SELECT 1
   FROM workspace_courses wc
  WHERE (wc.id = workspace_course_modules.course_id))));
