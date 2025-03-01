drop policy "Enable all access for current user" on "public"."nova_test_timer_record";

revoke delete on table "public"."nova_test_timer_record" from "anon";

revoke insert on table "public"."nova_test_timer_record" from "anon";

revoke references on table "public"."nova_test_timer_record" from "anon";

revoke select on table "public"."nova_test_timer_record" from "anon";

revoke trigger on table "public"."nova_test_timer_record" from "anon";

revoke truncate on table "public"."nova_test_timer_record" from "anon";

revoke update on table "public"."nova_test_timer_record" from "anon";

revoke delete on table "public"."nova_test_timer_record" from "authenticated";

revoke insert on table "public"."nova_test_timer_record" from "authenticated";

revoke references on table "public"."nova_test_timer_record" from "authenticated";

revoke select on table "public"."nova_test_timer_record" from "authenticated";

revoke trigger on table "public"."nova_test_timer_record" from "authenticated";

revoke truncate on table "public"."nova_test_timer_record" from "authenticated";

revoke update on table "public"."nova_test_timer_record" from "authenticated";

revoke delete on table "public"."nova_test_timer_record" from "service_role";

revoke insert on table "public"."nova_test_timer_record" from "service_role";

revoke references on table "public"."nova_test_timer_record" from "service_role";

revoke select on table "public"."nova_test_timer_record" from "service_role";

revoke trigger on table "public"."nova_test_timer_record" from "service_role";

revoke truncate on table "public"."nova_test_timer_record" from "service_role";

revoke update on table "public"."nova_test_timer_record" from "service_role";

alter table "public"."nova_test_timer_record" drop constraint "nova_test_timer_record_problem_id_fkey";

alter table "public"."nova_test_timer_record" drop constraint "nova_test_timer_record_userId_fkey";

alter table "public"."nova_test_timer_record" drop constraint "nova_test_timer_record_pkey";

drop index if exists "public"."nova_test_timer_record_pkey";

drop table "public"."nova_test_timer_record";

create table "public"."nova_test_timer_records" (
    "id" uuid not null default gen_random_uuid(),
    "duration" integer,
    "problem_id" uuid,
    "user_id" uuid,
    "test_status" text,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_test_timer_records" enable row level security;

CREATE UNIQUE INDEX nova_test_timer_record_pkey ON public.nova_test_timer_records USING btree (id);

alter table "public"."nova_test_timer_records" add constraint "nova_test_timer_record_pkey" PRIMARY KEY using index "nova_test_timer_record_pkey";

alter table "public"."nova_test_timer_records" add constraint "nova_test_timer_records_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) not valid;

alter table "public"."nova_test_timer_records" validate constraint "nova_test_timer_records_problem_id_fkey";

alter table "public"."nova_test_timer_records" add constraint "nova_test_timer_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."nova_test_timer_records" validate constraint "nova_test_timer_records_user_id_fkey";

grant delete on table "public"."nova_test_timer_records" to "anon";

grant insert on table "public"."nova_test_timer_records" to "anon";

grant references on table "public"."nova_test_timer_records" to "anon";

grant select on table "public"."nova_test_timer_records" to "anon";

grant trigger on table "public"."nova_test_timer_records" to "anon";

grant truncate on table "public"."nova_test_timer_records" to "anon";

grant update on table "public"."nova_test_timer_records" to "anon";

grant delete on table "public"."nova_test_timer_records" to "authenticated";

grant insert on table "public"."nova_test_timer_records" to "authenticated";

grant references on table "public"."nova_test_timer_records" to "authenticated";

grant select on table "public"."nova_test_timer_records" to "authenticated";

grant trigger on table "public"."nova_test_timer_records" to "authenticated";

grant truncate on table "public"."nova_test_timer_records" to "authenticated";

grant update on table "public"."nova_test_timer_records" to "authenticated";

grant delete on table "public"."nova_test_timer_records" to "service_role";

grant insert on table "public"."nova_test_timer_records" to "service_role";

grant references on table "public"."nova_test_timer_records" to "service_role";

grant select on table "public"."nova_test_timer_records" to "service_role";

grant trigger on table "public"."nova_test_timer_records" to "service_role";

grant truncate on table "public"."nova_test_timer_records" to "service_role";

grant update on table "public"."nova_test_timer_records" to "service_role";

create policy "Enable all access for current user"
on "public"."nova_test_timer_records"
as permissive
for all
to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



