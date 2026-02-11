create table "public"."discord_guild_members" (
    "id" uuid not null default gen_random_uuid(),
    "discord_guild_id" text not null,
    "discord_user_id" text not null,
    "platform_user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."discord_guild_members" enable row level security;

create table "public"."discord_integrations" (
    "id" uuid not null default gen_random_uuid(),
    "discord_guild_id" text not null,
    "ws_id" uuid not null,
    "creator_id" uuid not null default auth.uid(),
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."discord_integrations" enable row level security;

alter table "public"."platform_user_roles" add column "allow_discord_integrations" boolean not null default false;

CREATE UNIQUE INDEX discord_guild_members_pkey ON public.discord_guild_members USING btree (id);

CREATE UNIQUE INDEX discord_integrations_discord_guild_id_key ON public.discord_integrations USING btree (discord_guild_id);

CREATE UNIQUE INDEX discord_integrations_pkey ON public.discord_integrations USING btree (id);

CREATE UNIQUE INDEX discord_integrations_ws_id_key ON public.discord_integrations USING btree (ws_id);

alter table "public"."discord_guild_members" add constraint "discord_guild_members_pkey" PRIMARY KEY using index "discord_guild_members_pkey";

alter table "public"."discord_integrations" add constraint "discord_integrations_pkey" PRIMARY KEY using index "discord_integrations_pkey";

alter table "public"."discord_guild_members" add constraint "discord_guild_members_platform_user_id_fkey" FOREIGN KEY (platform_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."discord_guild_members" validate constraint "discord_guild_members_platform_user_id_fkey";

alter table "public"."discord_integrations" add constraint "discord_integrations_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE not valid;

alter table "public"."discord_integrations" validate constraint "discord_integrations_creator_id_fkey";

alter table "public"."discord_integrations" add constraint "discord_integrations_discord_guild_id_key" UNIQUE using index "discord_integrations_discord_guild_id_key";

alter table "public"."discord_integrations" add constraint "discord_integrations_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."discord_integrations" validate constraint "discord_integrations_ws_id_fkey";

alter table "public"."discord_integrations" add constraint "discord_integrations_ws_id_key" UNIQUE using index "discord_integrations_ws_id_key";

grant delete on table "public"."discord_guild_members" to "anon";

grant insert on table "public"."discord_guild_members" to "anon";

grant references on table "public"."discord_guild_members" to "anon";

grant select on table "public"."discord_guild_members" to "anon";

grant trigger on table "public"."discord_guild_members" to "anon";

grant truncate on table "public"."discord_guild_members" to "anon";

grant update on table "public"."discord_guild_members" to "anon";

grant delete on table "public"."discord_guild_members" to "authenticated";

grant insert on table "public"."discord_guild_members" to "authenticated";

grant references on table "public"."discord_guild_members" to "authenticated";

grant select on table "public"."discord_guild_members" to "authenticated";

grant trigger on table "public"."discord_guild_members" to "authenticated";

grant truncate on table "public"."discord_guild_members" to "authenticated";

grant update on table "public"."discord_guild_members" to "authenticated";

grant delete on table "public"."discord_guild_members" to "service_role";

grant insert on table "public"."discord_guild_members" to "service_role";

grant references on table "public"."discord_guild_members" to "service_role";

grant select on table "public"."discord_guild_members" to "service_role";

grant trigger on table "public"."discord_guild_members" to "service_role";

grant truncate on table "public"."discord_guild_members" to "service_role";

grant update on table "public"."discord_guild_members" to "service_role";

grant delete on table "public"."discord_integrations" to "anon";

grant insert on table "public"."discord_integrations" to "anon";

grant references on table "public"."discord_integrations" to "anon";

grant select on table "public"."discord_integrations" to "anon";

grant trigger on table "public"."discord_integrations" to "anon";

grant truncate on table "public"."discord_integrations" to "anon";

grant update on table "public"."discord_integrations" to "anon";

grant delete on table "public"."discord_integrations" to "authenticated";

grant insert on table "public"."discord_integrations" to "authenticated";

grant references on table "public"."discord_integrations" to "authenticated";

grant select on table "public"."discord_integrations" to "authenticated";

grant trigger on table "public"."discord_integrations" to "authenticated";

grant truncate on table "public"."discord_integrations" to "authenticated";

grant update on table "public"."discord_integrations" to "authenticated";

grant delete on table "public"."discord_integrations" to "service_role";

grant insert on table "public"."discord_integrations" to "service_role";

grant references on table "public"."discord_integrations" to "service_role";

grant select on table "public"."discord_integrations" to "service_role";

grant trigger on table "public"."discord_integrations" to "service_role";

grant truncate on table "public"."discord_integrations" to "service_role";

grant update on table "public"."discord_integrations" to "service_role";

create policy "Allow users who have access to workspace"
on "public"."discord_guild_members"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM discord_integrations di,
    workspace_members wm
  WHERE ((wm.ws_id = di.ws_id) AND (wm.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM discord_integrations di,
    workspace_members wm
  WHERE ((wm.ws_id = di.ws_id) AND (wm.user_id = auth.uid())))));


create policy "Allow users who have sufficient platform role"
on "public"."discord_integrations"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM platform_user_roles pur
  WHERE ((pur.user_id = auth.uid()) AND (pur.allow_discord_integrations = true)))))
with check ((EXISTS ( SELECT 1
   FROM platform_user_roles pur
  WHERE ((pur.user_id = auth.uid()) AND (pur.allow_discord_integrations = true)))));



