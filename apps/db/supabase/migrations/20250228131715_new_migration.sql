drop policy "Enable all access for current user" on "public"."nova_test_timer_records";

drop policy "Enable all access for current user" on "public"."nova_user_challenge";

drop policy "Enable all access for current user" on "public"."nova_submissions";

revoke delete on table "public"."nova_test_timer_records" from "anon";

revoke insert on table "public"."nova_test_timer_records" from "anon";

revoke references on table "public"."nova_test_timer_records" from "anon";

revoke select on table "public"."nova_test_timer_records" from "anon";

revoke trigger on table "public"."nova_test_timer_records" from "anon";

revoke truncate on table "public"."nova_test_timer_records" from "anon";

revoke update on table "public"."nova_test_timer_records" from "anon";

revoke delete on table "public"."nova_test_timer_records" from "authenticated";

revoke insert on table "public"."nova_test_timer_records" from "authenticated";

revoke references on table "public"."nova_test_timer_records" from "authenticated";

revoke select on table "public"."nova_test_timer_records" from "authenticated";

revoke trigger on table "public"."nova_test_timer_records" from "authenticated";

revoke truncate on table "public"."nova_test_timer_records" from "authenticated";

revoke update on table "public"."nova_test_timer_records" from "authenticated";

revoke delete on table "public"."nova_test_timer_records" from "service_role";

revoke insert on table "public"."nova_test_timer_records" from "service_role";

revoke references on table "public"."nova_test_timer_records" from "service_role";

revoke select on table "public"."nova_test_timer_records" from "service_role";

revoke trigger on table "public"."nova_test_timer_records" from "service_role";

revoke truncate on table "public"."nova_test_timer_records" from "service_role";

revoke update on table "public"."nova_test_timer_records" from "service_role";

revoke delete on table "public"."nova_user_challenge" from "anon";

revoke insert on table "public"."nova_user_challenge" from "anon";

revoke references on table "public"."nova_user_challenge" from "anon";

revoke select on table "public"."nova_user_challenge" from "anon";

revoke trigger on table "public"."nova_user_challenge" from "anon";

revoke truncate on table "public"."nova_user_challenge" from "anon";

revoke update on table "public"."nova_user_challenge" from "anon";

revoke delete on table "public"."nova_user_challenge" from "authenticated";

revoke insert on table "public"."nova_user_challenge" from "authenticated";

revoke references on table "public"."nova_user_challenge" from "authenticated";

revoke select on table "public"."nova_user_challenge" from "authenticated";

revoke trigger on table "public"."nova_user_challenge" from "authenticated";

revoke truncate on table "public"."nova_user_challenge" from "authenticated";

revoke update on table "public"."nova_user_challenge" from "authenticated";

revoke delete on table "public"."nova_user_challenge" from "service_role";

revoke insert on table "public"."nova_user_challenge" from "service_role";

revoke references on table "public"."nova_user_challenge" from "service_role";

revoke select on table "public"."nova_user_challenge" from "service_role";

revoke trigger on table "public"."nova_user_challenge" from "service_role";

revoke truncate on table "public"."nova_user_challenge" from "service_role";

revoke update on table "public"."nova_user_challenge" from "service_role";

alter table "public"."nova_test_timer_records" drop constraint "nova_test_timer_records_challenge_id_fkey";

alter table "public"."nova_test_timer_records" drop constraint "nova_test_timer_records_user_id_fkey";

alter table "public"."nova_user_challenge" drop constraint "nova_user_challenge_challenge_id_fkey";

alter table "public"."nova_user_challenge" drop constraint "nova_user_challenge_user_id_fkey";

alter table "public"."nova_test_timer_records" drop constraint "nova_test_timer_record_pkey";

drop index if exists "public"."nova_test_timer_record_pkey";

drop table "public"."nova_test_timer_records";

drop table "public"."nova_user_challenge";

create table "public"."nova_challenge_status" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "challenge_id" uuid,
    "status" text,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "total_score" real,
    "feedback" text,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_challenge_status" enable row level security;

CREATE UNIQUE INDEX nova_challenge_status_pkey ON public.nova_challenge_status USING btree (id);

alter table "public"."nova_challenge_status" add constraint "nova_challenge_status_pkey" PRIMARY KEY using index "nova_challenge_status_pkey";

alter table "public"."nova_challenge_status" add constraint "nova_challenge_status_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_challenge_status" validate constraint "nova_challenge_status_challenge_id_fkey";

alter table "public"."nova_challenge_status" add constraint "nova_challenge_status_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_challenge_status" validate constraint "nova_challenge_status_user_id_fkey";

grant delete on table "public"."nova_challenge_status" to "anon";

grant insert on table "public"."nova_challenge_status" to "anon";

grant references on table "public"."nova_challenge_status" to "anon";

grant select on table "public"."nova_challenge_status" to "anon";

grant trigger on table "public"."nova_challenge_status" to "anon";

grant truncate on table "public"."nova_challenge_status" to "anon";

grant update on table "public"."nova_challenge_status" to "anon";

grant delete on table "public"."nova_challenge_status" to "authenticated";

grant insert on table "public"."nova_challenge_status" to "authenticated";

grant references on table "public"."nova_challenge_status" to "authenticated";

grant select on table "public"."nova_challenge_status" to "authenticated";

grant trigger on table "public"."nova_challenge_status" to "authenticated";

grant truncate on table "public"."nova_challenge_status" to "authenticated";

grant update on table "public"."nova_challenge_status" to "authenticated";

grant delete on table "public"."nova_challenge_status" to "service_role";

grant insert on table "public"."nova_challenge_status" to "service_role";

grant references on table "public"."nova_challenge_status" to "service_role";

grant select on table "public"."nova_challenge_status" to "service_role";

grant trigger on table "public"."nova_challenge_status" to "service_role";

grant truncate on table "public"."nova_challenge_status" to "service_role";

grant update on table "public"."nova_challenge_status" to "service_role";

create policy "Enable all access for current user"
on "public"."nova_challenge_status"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable all access for current user"
on "public"."nova_submissions"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



