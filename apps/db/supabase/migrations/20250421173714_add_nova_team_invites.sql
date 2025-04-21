create type "public"."invitation_status" as enum ('pending', 'accepted', 'declined', 'expired');

create table "public"."nova_team_invites" (
    "team_id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "status" invitation_status not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."nova_team_invites" enable row level security;

CREATE UNIQUE INDEX nova_team_invites_pkey ON public.nova_team_invites USING btree (team_id, email);

alter table "public"."nova_team_invites" add constraint "nova_team_invites_pkey" PRIMARY KEY using index "nova_team_invites_pkey";

alter table "public"."nova_team_invites" add constraint "nova_team_invites_team_id_fkey" FOREIGN KEY (team_id) REFERENCES nova_teams(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_team_invites" validate constraint "nova_team_invites_team_id_fkey";

grant delete on table "public"."nova_team_invites" to "anon";

grant insert on table "public"."nova_team_invites" to "anon";

grant references on table "public"."nova_team_invites" to "anon";

grant select on table "public"."nova_team_invites" to "anon";

grant trigger on table "public"."nova_team_invites" to "anon";

grant truncate on table "public"."nova_team_invites" to "anon";

grant update on table "public"."nova_team_invites" to "anon";

grant delete on table "public"."nova_team_invites" to "authenticated";

grant insert on table "public"."nova_team_invites" to "authenticated";

grant references on table "public"."nova_team_invites" to "authenticated";

grant select on table "public"."nova_team_invites" to "authenticated";

grant trigger on table "public"."nova_team_invites" to "authenticated";

grant truncate on table "public"."nova_team_invites" to "authenticated";

grant update on table "public"."nova_team_invites" to "authenticated";

grant delete on table "public"."nova_team_invites" to "service_role";

grant insert on table "public"."nova_team_invites" to "service_role";

grant references on table "public"."nova_team_invites" to "service_role";

grant select on table "public"."nova_team_invites" to "service_role";

grant trigger on table "public"."nova_team_invites" to "service_role";

grant truncate on table "public"."nova_team_invites" to "service_role";

grant update on table "public"."nova_team_invites" to "service_role";


