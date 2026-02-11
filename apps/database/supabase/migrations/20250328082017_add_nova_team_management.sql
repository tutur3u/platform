create table "public"."nova_team_members" (
    "team_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."nova_team_members" enable row level security;

create table "public"."nova_teams" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."nova_teams" enable row level security;

CREATE UNIQUE INDEX nova_team_members_pkey ON public.nova_team_members USING btree (team_id, user_id);

CREATE UNIQUE INDEX nova_teams_pkey ON public.nova_teams USING btree (id);

alter table "public"."nova_team_members" add constraint "nova_team_members_pkey" PRIMARY KEY using index "nova_team_members_pkey";

alter table "public"."nova_teams" add constraint "nova_teams_pkey" PRIMARY KEY using index "nova_teams_pkey";

alter table "public"."nova_team_members" add constraint "nova_team_members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES nova_teams(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_team_members" validate constraint "nova_team_members_team_id_fkey";

alter table "public"."nova_team_members" add constraint "nova_team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_team_members" validate constraint "nova_team_members_user_id_fkey";

grant delete on table "public"."nova_team_members" to "anon";

grant insert on table "public"."nova_team_members" to "anon";

grant references on table "public"."nova_team_members" to "anon";

grant select on table "public"."nova_team_members" to "anon";

grant trigger on table "public"."nova_team_members" to "anon";

grant truncate on table "public"."nova_team_members" to "anon";

grant update on table "public"."nova_team_members" to "anon";

grant delete on table "public"."nova_team_members" to "authenticated";

grant insert on table "public"."nova_team_members" to "authenticated";

grant references on table "public"."nova_team_members" to "authenticated";

grant select on table "public"."nova_team_members" to "authenticated";

grant trigger on table "public"."nova_team_members" to "authenticated";

grant truncate on table "public"."nova_team_members" to "authenticated";

grant update on table "public"."nova_team_members" to "authenticated";

grant delete on table "public"."nova_team_members" to "service_role";

grant insert on table "public"."nova_team_members" to "service_role";

grant references on table "public"."nova_team_members" to "service_role";

grant select on table "public"."nova_team_members" to "service_role";

grant trigger on table "public"."nova_team_members" to "service_role";

grant truncate on table "public"."nova_team_members" to "service_role";

grant update on table "public"."nova_team_members" to "service_role";

grant delete on table "public"."nova_teams" to "anon";

grant insert on table "public"."nova_teams" to "anon";

grant references on table "public"."nova_teams" to "anon";

grant select on table "public"."nova_teams" to "anon";

grant trigger on table "public"."nova_teams" to "anon";

grant truncate on table "public"."nova_teams" to "anon";

grant update on table "public"."nova_teams" to "anon";

grant delete on table "public"."nova_teams" to "authenticated";

grant insert on table "public"."nova_teams" to "authenticated";

grant references on table "public"."nova_teams" to "authenticated";

grant select on table "public"."nova_teams" to "authenticated";

grant trigger on table "public"."nova_teams" to "authenticated";

grant truncate on table "public"."nova_teams" to "authenticated";

grant update on table "public"."nova_teams" to "authenticated";

grant delete on table "public"."nova_teams" to "service_role";

grant insert on table "public"."nova_teams" to "service_role";

grant references on table "public"."nova_teams" to "service_role";

grant select on table "public"."nova_teams" to "service_role";

grant trigger on table "public"."nova_teams" to "service_role";

grant truncate on table "public"."nova_teams" to "service_role";

grant update on table "public"."nova_teams" to "service_role";

create table "public"."nova_team_emails" (
    "team_id" uuid not null,
    "email" text not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."nova_team_emails" enable row level security;

CREATE UNIQUE INDEX nova_team_emails_pkey ON public.nova_team_emails USING btree (team_id, email);

alter table "public"."nova_team_emails" add constraint "nova_team_emails_pkey" PRIMARY KEY using index "nova_team_emails_pkey";

alter table "public"."nova_team_emails" add constraint "nova_team_emails_team_id_fkey" FOREIGN KEY (team_id) REFERENCES nova_teams(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_team_emails" validate constraint "nova_team_emails_team_id_fkey";

grant delete on table "public"."nova_team_emails" to "anon";

grant insert on table "public"."nova_team_emails" to "anon";

grant references on table "public"."nova_team_emails" to "anon";

grant select on table "public"."nova_team_emails" to "anon";

grant trigger on table "public"."nova_team_emails" to "anon";

grant truncate on table "public"."nova_team_emails" to "anon";

grant update on table "public"."nova_team_emails" to "anon";

grant delete on table "public"."nova_team_emails" to "authenticated";

grant insert on table "public"."nova_team_emails" to "authenticated";

grant references on table "public"."nova_team_emails" to "authenticated";

grant select on table "public"."nova_team_emails" to "authenticated";

grant trigger on table "public"."nova_team_emails" to "authenticated";

grant truncate on table "public"."nova_team_emails" to "authenticated";

grant update on table "public"."nova_team_emails" to "authenticated";

grant delete on table "public"."nova_team_emails" to "service_role";

grant insert on table "public"."nova_team_emails" to "service_role";

grant references on table "public"."nova_team_emails" to "service_role";

grant select on table "public"."nova_team_emails" to "service_role";

grant trigger on table "public"."nova_team_emails" to "service_role";

grant truncate on table "public"."nova_team_emails" to "service_role";

grant update on table "public"."nova_team_emails" to "service_role";

create policy "Allow all access for nova admins"
on "public"."nova_team_emails"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))));

create policy "Allow all access for nova admins"
on "public"."nova_team_members"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))));

create policy "Allow all access for nova admins"
on "public"."nova_teams"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))))
with check ((EXISTS ( SELECT 1
   FROM nova_roles
  WHERE ((nova_roles.email = auth.email()) AND (nova_roles.allow_role_management = true)))));