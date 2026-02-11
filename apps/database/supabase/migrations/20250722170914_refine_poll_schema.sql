drop policy "Enable read access for all users" on "public"."guest_poll_votes";

drop policy "Enable insert for all users" on "public"."poll_option";

drop policy "Enable read access for all users" on "public"."poll_option";

drop policy "Enable insert for authenticated users only" on "public"."polls";

drop policy "Enable read access for all users" on "public"."polls";

drop policy "Enable insert for users based on user_id" on "public"."users_poll_votes";

drop policy "Enable read access for all users" on "public"."users_poll_votes";

drop policy "Enable update for users based on uid" on "public"."users_poll_votes";

revoke delete on table "public"."guest_poll_votes" from "anon";

revoke insert on table "public"."guest_poll_votes" from "anon";

revoke references on table "public"."guest_poll_votes" from "anon";

revoke select on table "public"."guest_poll_votes" from "anon";

revoke trigger on table "public"."guest_poll_votes" from "anon";

revoke truncate on table "public"."guest_poll_votes" from "anon";

revoke update on table "public"."guest_poll_votes" from "anon";

revoke delete on table "public"."guest_poll_votes" from "authenticated";

revoke insert on table "public"."guest_poll_votes" from "authenticated";

revoke references on table "public"."guest_poll_votes" from "authenticated";

revoke select on table "public"."guest_poll_votes" from "authenticated";

revoke trigger on table "public"."guest_poll_votes" from "authenticated";

revoke truncate on table "public"."guest_poll_votes" from "authenticated";

revoke update on table "public"."guest_poll_votes" from "authenticated";

revoke delete on table "public"."guest_poll_votes" from "service_role";

revoke insert on table "public"."guest_poll_votes" from "service_role";

revoke references on table "public"."guest_poll_votes" from "service_role";

revoke select on table "public"."guest_poll_votes" from "service_role";

revoke trigger on table "public"."guest_poll_votes" from "service_role";

revoke truncate on table "public"."guest_poll_votes" from "service_role";

revoke update on table "public"."guest_poll_votes" from "service_role";

revoke delete on table "public"."poll_option" from "anon";

revoke insert on table "public"."poll_option" from "anon";

revoke references on table "public"."poll_option" from "anon";

revoke select on table "public"."poll_option" from "anon";

revoke trigger on table "public"."poll_option" from "anon";

revoke truncate on table "public"."poll_option" from "anon";

revoke update on table "public"."poll_option" from "anon";

revoke delete on table "public"."poll_option" from "authenticated";

revoke insert on table "public"."poll_option" from "authenticated";

revoke references on table "public"."poll_option" from "authenticated";

revoke select on table "public"."poll_option" from "authenticated";

revoke trigger on table "public"."poll_option" from "authenticated";

revoke truncate on table "public"."poll_option" from "authenticated";

revoke update on table "public"."poll_option" from "authenticated";

revoke delete on table "public"."poll_option" from "service_role";

revoke insert on table "public"."poll_option" from "service_role";

revoke references on table "public"."poll_option" from "service_role";

revoke select on table "public"."poll_option" from "service_role";

revoke trigger on table "public"."poll_option" from "service_role";

revoke truncate on table "public"."poll_option" from "service_role";

revoke update on table "public"."poll_option" from "service_role";

revoke delete on table "public"."users_poll_votes" from "anon";

revoke insert on table "public"."users_poll_votes" from "anon";

revoke references on table "public"."users_poll_votes" from "anon";

revoke select on table "public"."users_poll_votes" from "anon";

revoke trigger on table "public"."users_poll_votes" from "anon";

revoke truncate on table "public"."users_poll_votes" from "anon";

revoke update on table "public"."users_poll_votes" from "anon";

revoke delete on table "public"."users_poll_votes" from "authenticated";

revoke insert on table "public"."users_poll_votes" from "authenticated";

revoke references on table "public"."users_poll_votes" from "authenticated";

revoke select on table "public"."users_poll_votes" from "authenticated";

revoke trigger on table "public"."users_poll_votes" from "authenticated";

revoke truncate on table "public"."users_poll_votes" from "authenticated";

revoke update on table "public"."users_poll_votes" from "authenticated";

revoke delete on table "public"."users_poll_votes" from "service_role";

revoke insert on table "public"."users_poll_votes" from "service_role";

revoke references on table "public"."users_poll_votes" from "service_role";

revoke select on table "public"."users_poll_votes" from "service_role";

revoke trigger on table "public"."users_poll_votes" from "service_role";

revoke truncate on table "public"."users_poll_votes" from "service_role";

revoke update on table "public"."users_poll_votes" from "service_role";

alter table "public"."guest_poll_votes" drop constraint "guest_poll_votes_guest_id_fkey";

alter table "public"."guest_poll_votes" drop constraint "guest_poll_votes_option_id_fkey";

alter table "public"."poll_option" drop constraint "poll_option_poll_id_fkey";

alter table "public"."users_poll_votes" drop constraint "users_poll_votes_option_id_fkey";

alter table "public"."users_poll_votes" drop constraint "users_poll_votes_user_id_fkey";

alter table "public"."guest_poll_votes" drop constraint "guest_poll_votes_pkey";

alter table "public"."poll_option" drop constraint "poll_option_pkey";

alter table "public"."users_poll_votes" drop constraint "users_poll_votes_pkey";

drop index if exists "public"."guest_poll_votes_pkey";

drop index if exists "public"."poll_option_pkey";

drop index if exists "public"."users_poll_votes_pkey";

drop table "public"."guest_poll_votes";

drop table "public"."poll_option";

drop table "public"."users_poll_votes";

create table "public"."poll_guest_permissions" (
    "poll_id" uuid not null,
    "read_poll" boolean not null default true,
    "update_poll" boolean not null default true,
    "delete_poll" boolean not null default true,
    "can_vote" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."poll_guest_permissions" enable row level security;

create table "public"."poll_guest_votes" (
    "id" uuid not null default gen_random_uuid(),
    "guest_id" uuid not null,
    "option_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."poll_guest_votes" enable row level security;

create table "public"."poll_options" (
    "id" uuid not null default gen_random_uuid(),
    "value" text not null default ''::text,
    "poll_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."poll_options" enable row level security;

create table "public"."poll_user_permissions" (
    "poll_id" uuid not null,
    "user_id" uuid not null,
    "read_poll" boolean not null default true,
    "update_poll" boolean not null default true,
    "delete_poll" boolean not null default true,
    "can_vote" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."poll_user_permissions" enable row level security;

create table "public"."poll_user_votes" (
    "id" uuid not null default gen_random_uuid(),
    "option_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."poll_user_votes" enable row level security;

alter table "public"."polls" drop column "poll_name";

alter table "public"."polls" add column "allow_anonymous_updates" boolean not null default false;

alter table "public"."polls" add column "creator_id" uuid not null;

alter table "public"."polls" add column "name" text not null default ''::text;

alter table "public"."polls" add column "ws_id" uuid;

CREATE UNIQUE INDEX poll_guest_permissions_pkey ON public.poll_guest_permissions USING btree (poll_id);

CREATE UNIQUE INDEX poll_guest_permissions_poll_id_key ON public.poll_guest_permissions USING btree (poll_id);

CREATE UNIQUE INDEX poll_user_permissions_pkey ON public.poll_user_permissions USING btree (poll_id, user_id);

CREATE UNIQUE INDEX guest_poll_votes_pkey ON public.poll_guest_votes USING btree (id);

CREATE UNIQUE INDEX poll_option_pkey ON public.poll_options USING btree (id);

CREATE UNIQUE INDEX users_poll_votes_pkey ON public.poll_user_votes USING btree (id);

alter table "public"."poll_guest_permissions" add constraint "poll_guest_permissions_pkey" PRIMARY KEY using index "poll_guest_permissions_pkey";

alter table "public"."poll_guest_votes" add constraint "guest_poll_votes_pkey" PRIMARY KEY using index "guest_poll_votes_pkey";

alter table "public"."poll_options" add constraint "poll_option_pkey" PRIMARY KEY using index "poll_option_pkey";

alter table "public"."poll_user_permissions" add constraint "poll_user_permissions_pkey" PRIMARY KEY using index "poll_user_permissions_pkey";

alter table "public"."poll_user_votes" add constraint "users_poll_votes_pkey" PRIMARY KEY using index "users_poll_votes_pkey";

alter table "public"."poll_guest_permissions" add constraint "poll_guest_permissions_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES polls(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_guest_permissions" validate constraint "poll_guest_permissions_poll_id_fkey";

alter table "public"."poll_guest_permissions" add constraint "poll_guest_permissions_poll_id_key" UNIQUE using index "poll_guest_permissions_poll_id_key";

alter table "public"."poll_guest_votes" add constraint "guest_poll_votes_guest_id_fkey" FOREIGN KEY (guest_id) REFERENCES meet_together_guests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_guest_votes" validate constraint "guest_poll_votes_guest_id_fkey";

alter table "public"."poll_guest_votes" add constraint "guest_poll_votes_option_id_fkey" FOREIGN KEY (option_id) REFERENCES poll_options(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_guest_votes" validate constraint "guest_poll_votes_option_id_fkey";

alter table "public"."poll_options" add constraint "poll_option_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES polls(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_options" validate constraint "poll_option_poll_id_fkey";

alter table "public"."poll_user_permissions" add constraint "poll_user_permissions_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES polls(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_user_permissions" validate constraint "poll_user_permissions_poll_id_fkey";

alter table "public"."poll_user_permissions" add constraint "poll_user_permissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_user_permissions" validate constraint "poll_user_permissions_user_id_fkey";

alter table "public"."poll_user_votes" add constraint "users_poll_votes_option_id_fkey" FOREIGN KEY (option_id) REFERENCES poll_options(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_user_votes" validate constraint "users_poll_votes_option_id_fkey";

alter table "public"."poll_user_votes" add constraint "users_poll_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."poll_user_votes" validate constraint "users_poll_votes_user_id_fkey";

alter table "public"."polls" add constraint "polls_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."polls" validate constraint "polls_creator_id_fkey";

alter table "public"."polls" add constraint "polls_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."polls" validate constraint "polls_ws_id_fkey";

grant delete on table "public"."poll_guest_permissions" to "anon";

grant insert on table "public"."poll_guest_permissions" to "anon";

grant references on table "public"."poll_guest_permissions" to "anon";

grant select on table "public"."poll_guest_permissions" to "anon";

grant trigger on table "public"."poll_guest_permissions" to "anon";

grant truncate on table "public"."poll_guest_permissions" to "anon";

grant update on table "public"."poll_guest_permissions" to "anon";

grant delete on table "public"."poll_guest_permissions" to "authenticated";

grant insert on table "public"."poll_guest_permissions" to "authenticated";

grant references on table "public"."poll_guest_permissions" to "authenticated";

grant select on table "public"."poll_guest_permissions" to "authenticated";

grant trigger on table "public"."poll_guest_permissions" to "authenticated";

grant truncate on table "public"."poll_guest_permissions" to "authenticated";

grant update on table "public"."poll_guest_permissions" to "authenticated";

grant delete on table "public"."poll_guest_permissions" to "service_role";

grant insert on table "public"."poll_guest_permissions" to "service_role";

grant references on table "public"."poll_guest_permissions" to "service_role";

grant select on table "public"."poll_guest_permissions" to "service_role";

grant trigger on table "public"."poll_guest_permissions" to "service_role";

grant truncate on table "public"."poll_guest_permissions" to "service_role";

grant update on table "public"."poll_guest_permissions" to "service_role";

grant delete on table "public"."poll_guest_votes" to "anon";

grant insert on table "public"."poll_guest_votes" to "anon";

grant references on table "public"."poll_guest_votes" to "anon";

grant select on table "public"."poll_guest_votes" to "anon";

grant trigger on table "public"."poll_guest_votes" to "anon";

grant truncate on table "public"."poll_guest_votes" to "anon";

grant update on table "public"."poll_guest_votes" to "anon";

grant delete on table "public"."poll_guest_votes" to "authenticated";

grant insert on table "public"."poll_guest_votes" to "authenticated";

grant references on table "public"."poll_guest_votes" to "authenticated";

grant select on table "public"."poll_guest_votes" to "authenticated";

grant trigger on table "public"."poll_guest_votes" to "authenticated";

grant truncate on table "public"."poll_guest_votes" to "authenticated";

grant update on table "public"."poll_guest_votes" to "authenticated";

grant delete on table "public"."poll_guest_votes" to "service_role";

grant insert on table "public"."poll_guest_votes" to "service_role";

grant references on table "public"."poll_guest_votes" to "service_role";

grant select on table "public"."poll_guest_votes" to "service_role";

grant trigger on table "public"."poll_guest_votes" to "service_role";

grant truncate on table "public"."poll_guest_votes" to "service_role";

grant update on table "public"."poll_guest_votes" to "service_role";

grant delete on table "public"."poll_options" to "anon";

grant insert on table "public"."poll_options" to "anon";

grant references on table "public"."poll_options" to "anon";

grant select on table "public"."poll_options" to "anon";

grant trigger on table "public"."poll_options" to "anon";

grant truncate on table "public"."poll_options" to "anon";

grant update on table "public"."poll_options" to "anon";

grant delete on table "public"."poll_options" to "authenticated";

grant insert on table "public"."poll_options" to "authenticated";

grant references on table "public"."poll_options" to "authenticated";

grant select on table "public"."poll_options" to "authenticated";

grant trigger on table "public"."poll_options" to "authenticated";

grant truncate on table "public"."poll_options" to "authenticated";

grant update on table "public"."poll_options" to "authenticated";

grant delete on table "public"."poll_options" to "service_role";

grant insert on table "public"."poll_options" to "service_role";

grant references on table "public"."poll_options" to "service_role";

grant select on table "public"."poll_options" to "service_role";

grant trigger on table "public"."poll_options" to "service_role";

grant truncate on table "public"."poll_options" to "service_role";

grant update on table "public"."poll_options" to "service_role";

grant delete on table "public"."poll_user_permissions" to "anon";

grant insert on table "public"."poll_user_permissions" to "anon";

grant references on table "public"."poll_user_permissions" to "anon";

grant select on table "public"."poll_user_permissions" to "anon";

grant trigger on table "public"."poll_user_permissions" to "anon";

grant truncate on table "public"."poll_user_permissions" to "anon";

grant update on table "public"."poll_user_permissions" to "anon";

grant delete on table "public"."poll_user_permissions" to "authenticated";

grant insert on table "public"."poll_user_permissions" to "authenticated";

grant references on table "public"."poll_user_permissions" to "authenticated";

grant select on table "public"."poll_user_permissions" to "authenticated";

grant trigger on table "public"."poll_user_permissions" to "authenticated";

grant truncate on table "public"."poll_user_permissions" to "authenticated";

grant update on table "public"."poll_user_permissions" to "authenticated";

grant delete on table "public"."poll_user_permissions" to "service_role";

grant insert on table "public"."poll_user_permissions" to "service_role";

grant references on table "public"."poll_user_permissions" to "service_role";

grant select on table "public"."poll_user_permissions" to "service_role";

grant trigger on table "public"."poll_user_permissions" to "service_role";

grant truncate on table "public"."poll_user_permissions" to "service_role";

grant update on table "public"."poll_user_permissions" to "service_role";

grant delete on table "public"."poll_user_votes" to "anon";

grant insert on table "public"."poll_user_votes" to "anon";

grant references on table "public"."poll_user_votes" to "anon";

grant select on table "public"."poll_user_votes" to "anon";

grant trigger on table "public"."poll_user_votes" to "anon";

grant truncate on table "public"."poll_user_votes" to "anon";

grant update on table "public"."poll_user_votes" to "anon";

grant delete on table "public"."poll_user_votes" to "authenticated";

grant insert on table "public"."poll_user_votes" to "authenticated";

grant references on table "public"."poll_user_votes" to "authenticated";

grant select on table "public"."poll_user_votes" to "authenticated";

grant trigger on table "public"."poll_user_votes" to "authenticated";

grant truncate on table "public"."poll_user_votes" to "authenticated";

grant update on table "public"."poll_user_votes" to "authenticated";

grant delete on table "public"."poll_user_votes" to "service_role";

grant insert on table "public"."poll_user_votes" to "service_role";

grant references on table "public"."poll_user_votes" to "service_role";

grant select on table "public"."poll_user_votes" to "service_role";

grant trigger on table "public"."poll_user_votes" to "service_role";

grant truncate on table "public"."poll_user_votes" to "service_role";

grant update on table "public"."poll_user_votes" to "service_role";

create policy "Allow all for poll creator"
on "public"."poll_guest_permissions"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM polls p
  WHERE ((p.id = poll_guest_permissions.poll_id) AND (p.creator_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM polls p
  WHERE ((p.id = poll_guest_permissions.poll_id) AND (p.creator_id = auth.uid())))));


create policy "Disable access for everyone"
on "public"."poll_guest_votes"
as permissive
for all
to authenticated
using (false)
with check (false);


create policy "Disable access for everyone"
on "public"."poll_options"
as permissive
for all
to authenticated
using (false)
with check (false);


create policy "Allow all for poll creator"
on "public"."poll_user_permissions"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM polls p
  WHERE ((p.id = poll_user_permissions.poll_id) AND (p.creator_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM polls p
  WHERE ((p.id = poll_user_permissions.poll_id) AND (p.creator_id = auth.uid())))));


create policy "Enable delete for users based on user_id"
on "public"."poll_user_votes"
as permissive
for delete
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable insert for users based on user_id"
on "public"."poll_user_votes"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Allow all if the user is the creator and workspace member"
on "public"."polls"
as permissive
for all
to authenticated
using (((creator_id = auth.uid()) AND ((ws_id IS NULL) OR is_org_member(auth.uid(), ws_id))))
with check (((creator_id = auth.uid()) AND ((ws_id IS NULL) OR is_org_member(auth.uid(), ws_id))));



