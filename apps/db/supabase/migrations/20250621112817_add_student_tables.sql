create table "public"."students" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "student_number" text not null,
    "program" text,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."students" enable row level security;

CREATE UNIQUE INDEX students_pkey ON public.students USING btree (id);

alter table "public"."students" add constraint "students_pkey" PRIMARY KEY using index "students_pkey";

grant delete on table "public"."students" to "anon";

grant insert on table "public"."students" to "anon";

grant references on table "public"."students" to "anon";

grant select on table "public"."students" to "anon";

grant trigger on table "public"."students" to "anon";

grant truncate on table "public"."students" to "anon";

grant update on table "public"."students" to "anon";

grant delete on table "public"."students" to "authenticated";

grant insert on table "public"."students" to "authenticated";

grant references on table "public"."students" to "authenticated";

grant select on table "public"."students" to "authenticated";

grant trigger on table "public"."students" to "authenticated";

grant truncate on table "public"."students" to "authenticated";

grant update on table "public"."students" to "authenticated";

grant delete on table "public"."students" to "service_role";

grant insert on table "public"."students" to "service_role";

grant references on table "public"."students" to "service_role";

grant select on table "public"."students" to "service_role";

grant trigger on table "public"."students" to "service_role";

grant truncate on table "public"."students" to "service_role";

grant update on table "public"."students" to "service_role";

create policy "Enable all access"
on "public"."students"
as permissive
for all
to public
using (true)
with check (true);



