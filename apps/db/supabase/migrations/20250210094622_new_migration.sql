create table "public"."nova_leaderboard" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "userId" uuid,
    "problemId" character varying,
    "score" real
);


alter table "public"."nova_leaderboard" enable row level security;

CREATE UNIQUE INDEX nova_leaderboard_pkey ON public.nova_leaderboard USING btree (id);

alter table "public"."nova_leaderboard" add constraint "nova_leaderboard_pkey" PRIMARY KEY using index "nova_leaderboard_pkey";

alter table "public"."nova_leaderboard" add constraint "nova_leaderboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES workspace_users(id) not valid;

alter table "public"."nova_leaderboard" validate constraint "nova_leaderboard_userId_fkey";

grant delete on table "public"."nova_leaderboard" to "anon";

grant insert on table "public"."nova_leaderboard" to "anon";

grant references on table "public"."nova_leaderboard" to "anon";

grant select on table "public"."nova_leaderboard" to "anon";

grant trigger on table "public"."nova_leaderboard" to "anon";

grant truncate on table "public"."nova_leaderboard" to "anon";

grant update on table "public"."nova_leaderboard" to "anon";

grant delete on table "public"."nova_leaderboard" to "authenticated";

grant insert on table "public"."nova_leaderboard" to "authenticated";

grant references on table "public"."nova_leaderboard" to "authenticated";

grant select on table "public"."nova_leaderboard" to "authenticated";

grant trigger on table "public"."nova_leaderboard" to "authenticated";

grant truncate on table "public"."nova_leaderboard" to "authenticated";

grant update on table "public"."nova_leaderboard" to "authenticated";

grant delete on table "public"."nova_leaderboard" to "service_role";

grant insert on table "public"."nova_leaderboard" to "service_role";

grant references on table "public"."nova_leaderboard" to "service_role";

grant select on table "public"."nova_leaderboard" to "service_role";

grant trigger on table "public"."nova_leaderboard" to "service_role";

grant truncate on table "public"."nova_leaderboard" to "service_role";

grant update on table "public"."nova_leaderboard" to "service_role";


