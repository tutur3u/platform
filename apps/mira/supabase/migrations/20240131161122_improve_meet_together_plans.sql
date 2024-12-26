revoke delete on table "public"."meet-together-plans" from "anon";

revoke insert on table "public"."meet-together-plans" from "anon";

revoke references on table "public"."meet-together-plans" from "anon";

revoke select on table "public"."meet-together-plans" from "anon";

revoke trigger on table "public"."meet-together-plans" from "anon";

revoke truncate on table "public"."meet-together-plans" from "anon";

revoke update on table "public"."meet-together-plans" from "anon";

revoke delete on table "public"."meet-together-plans" from "authenticated";

revoke insert on table "public"."meet-together-plans" from "authenticated";

revoke references on table "public"."meet-together-plans" from "authenticated";

revoke select on table "public"."meet-together-plans" from "authenticated";

revoke trigger on table "public"."meet-together-plans" from "authenticated";

revoke truncate on table "public"."meet-together-plans" from "authenticated";

revoke update on table "public"."meet-together-plans" from "authenticated";

revoke delete on table "public"."meet-together-plans" from "service_role";

revoke insert on table "public"."meet-together-plans" from "service_role";

revoke references on table "public"."meet-together-plans" from "service_role";

revoke select on table "public"."meet-together-plans" from "service_role";

revoke trigger on table "public"."meet-together-plans" from "service_role";

revoke truncate on table "public"."meet-together-plans" from "service_role";

revoke update on table "public"."meet-together-plans" from "service_role";

alter table "public"."meet-together-plans" drop constraint "meet-together-plans_pkey";

drop index if exists "public"."meet-together-plans_pkey";

drop table "public"."meet-together-plans";

create table "public"."meet_together_plans" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "dates" date[] not null,
    "start_time" time with time zone not null,
    "end_time" time with time zone not null,
    "created_at" timestamp with time zone default now(),
    "creator_id" uuid default auth.uid(),
    "description" text,
    "is_public" boolean not null default true
);


alter table "public"."meet_together_plans" enable row level security;

CREATE UNIQUE INDEX timezones_text_key ON public.timezones USING btree (text);

CREATE UNIQUE INDEX timezones_value_key ON public.timezones USING btree (value);

CREATE UNIQUE INDEX "meet-together-plans_pkey" ON public.meet_together_plans USING btree (id);

alter table "public"."meet_together_plans" add constraint "meet-together-plans_pkey" PRIMARY KEY using index "meet-together-plans_pkey";

alter table "public"."meet_together_plans" add constraint "meet_together_plans_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."meet_together_plans" validate constraint "meet_together_plans_creator_id_fkey";

alter table "public"."timezones" add constraint "timezones_text_key" UNIQUE using index "timezones_text_key";

alter table "public"."timezones" add constraint "timezones_value_key" UNIQUE using index "timezones_value_key";

grant delete on table "public"."meet_together_plans" to "anon";

grant insert on table "public"."meet_together_plans" to "anon";

grant references on table "public"."meet_together_plans" to "anon";

grant select on table "public"."meet_together_plans" to "anon";

grant trigger on table "public"."meet_together_plans" to "anon";

grant truncate on table "public"."meet_together_plans" to "anon";

grant update on table "public"."meet_together_plans" to "anon";

grant delete on table "public"."meet_together_plans" to "authenticated";

grant insert on table "public"."meet_together_plans" to "authenticated";

grant references on table "public"."meet_together_plans" to "authenticated";

grant select on table "public"."meet_together_plans" to "authenticated";

grant trigger on table "public"."meet_together_plans" to "authenticated";

grant truncate on table "public"."meet_together_plans" to "authenticated";

grant update on table "public"."meet_together_plans" to "authenticated";

grant delete on table "public"."meet_together_plans" to "service_role";

grant insert on table "public"."meet_together_plans" to "service_role";

grant references on table "public"."meet_together_plans" to "service_role";

grant select on table "public"."meet_together_plans" to "service_role";

grant trigger on table "public"."meet_together_plans" to "service_role";

grant truncate on table "public"."meet_together_plans" to "service_role";

grant update on table "public"."meet_together_plans" to "service_role";

create policy "Allow all if the user is the creator"
on "public"."meet_together_plans"
as permissive
for all
to authenticated
using ((creator_id = auth.uid()))
with check ((creator_id = auth.uid()));


create policy "Enable read access for all users if plan is public"
on "public"."meet_together_plans"
as permissive
for select
to public
using (is_public);



