create table "public"."course_certificates" (
    "id" text not null default '''CERT-'' || TO_CHAR(NOW(), ''YYYY-MM-DD-'') || gen_random_uuid()::text'::text,
    "user_id" uuid not null default auth.uid(),
    "course_id" uuid not null,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text),
    "completed_date" date not null
);


alter table "public"."course_certificates" enable row level security;

CREATE UNIQUE INDEX course_certificates_pkey ON public.course_certificates USING btree (id);

CREATE UNIQUE INDEX uq_user_certificate ON public.course_certificates USING btree (user_id, course_id);

alter table "public"."course_certificates" add constraint "course_certificates_pkey" PRIMARY KEY using index "course_certificates_pkey";

alter table "public"."course_certificates" add constraint "course_certificates_course_id_fkey" FOREIGN KEY (course_id) REFERENCES workspace_courses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_certificates" validate constraint "course_certificates_course_id_fkey";

alter table "public"."course_certificates" add constraint "course_certificates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."course_certificates" validate constraint "course_certificates_user_id_fkey";

alter table "public"."course_certificates" add constraint "uq_user_certificate" UNIQUE using index "uq_user_certificate";

grant delete on table "public"."course_certificates" to "anon";

grant insert on table "public"."course_certificates" to "anon";

grant references on table "public"."course_certificates" to "anon";

grant select on table "public"."course_certificates" to "anon";

grant trigger on table "public"."course_certificates" to "anon";

grant truncate on table "public"."course_certificates" to "anon";

grant update on table "public"."course_certificates" to "anon";

grant delete on table "public"."course_certificates" to "authenticated";

grant insert on table "public"."course_certificates" to "authenticated";

grant references on table "public"."course_certificates" to "authenticated";

grant select on table "public"."course_certificates" to "authenticated";

grant trigger on table "public"."course_certificates" to "authenticated";

grant truncate on table "public"."course_certificates" to "authenticated";

grant update on table "public"."course_certificates" to "authenticated";

grant delete on table "public"."course_certificates" to "service_role";

grant insert on table "public"."course_certificates" to "service_role";

grant references on table "public"."course_certificates" to "service_role";

grant select on table "public"."course_certificates" to "service_role";

grant trigger on table "public"."course_certificates" to "service_role";

grant truncate on table "public"."course_certificates" to "service_role";

grant update on table "public"."course_certificates" to "service_role";

create policy "Enable delete for users based on user_id"
on "public"."course_certificates"
as permissive
for delete
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable insert for users based on user_id"
on "public"."course_certificates"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable update for users based on user_id"
on "public"."course_certificates"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable users to view their own data only"
on "public"."course_certificates"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



