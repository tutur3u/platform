drop policy "Enable all access for challenge manager" on "public"."nova_challenge_whitelisted_emails";

revoke delete on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke insert on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke references on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke select on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke trigger on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke truncate on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke update on table "public"."nova_challenge_whitelisted_emails" from "anon";

revoke delete on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke insert on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke references on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke select on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke trigger on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke truncate on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke update on table "public"."nova_challenge_whitelisted_emails" from "authenticated";

revoke delete on table "public"."nova_challenge_whitelisted_emails" from "service_role";

revoke insert on table "public"."nova_challenge_whitelisted_emails" from "service_role";

revoke references on table "public"."nova_challenge_whitelisted_emails" from "service_role";

revoke select on table "public"."nova_challenge_whitelisted_emails" from "service_role";

revoke trigger on table "public"."nova_challenge_whitelisted_emails" from "service_role";

revoke truncate on table "public"."nova_challenge_whitelisted_emails" from "service_role";

revoke update on table "public"."nova_challenge_whitelisted_emails" from "service_role";

alter table "public"."nova_challenge_whitelisted_emails" drop constraint "nova_challenge_whitelisted_emails_challenge_id_fkey";

alter table "public"."nova_challenge_whitelisted_emails" drop constraint "nova_challenge_whitelisted_emails_pkey";

drop index if exists "public"."nova_challenge_whitelisted_emails_pkey";

drop table "public"."nova_challenge_whitelisted_emails";

create table "public"."nova_challenge_whitelisted_emails" (
    "challenge_id" uuid not null,
    "email" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_challenge_whitelisted_emails" enable row level security;

CREATE UNIQUE INDEX nova_challenge_whitelisted_emails_pkey ON public.nova_challenge_whitelisted_emails USING btree (challenge_id, email);

alter table "public"."nova_challenge_whitelisted_emails" add constraint "nova_challenge_whitelisted_emails_pkey" PRIMARY KEY using index "nova_challenge_whitelisted_emails_pkey";

alter table "public"."nova_challenge_whitelisted_emails" add constraint "nova_challenge_whitelisted_emails_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_challenge_whitelisted_emails" validate constraint "nova_challenge_whitelisted_emails_challenge_id_fkey";

grant delete on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant insert on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant references on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant select on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant trigger on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant truncate on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant update on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant delete on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant insert on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant references on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant select on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant trigger on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant truncate on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant update on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant delete on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant insert on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant references on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant select on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant trigger on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant truncate on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant update on table "public"."nova_challenge_whitelisted_emails" to "service_role";

create policy "Enable all access for challenge manager"
on "public"."nova_challenge_whitelisted_emails"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_challenge_management = true)))));



