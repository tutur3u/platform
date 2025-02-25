create table "public"."nova_challenges" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "title" text,
    "topic" text,
    "description" text,
    "duration" integer
);


alter table "public"."nova_challenges" enable row level security;

CREATE UNIQUE INDEX nova_challenges_pkey ON public.nova_challenges USING btree (id);

alter table "public"."nova_challenges" add constraint "nova_challenges_pkey" PRIMARY KEY using index "nova_challenges_pkey";

grant delete on table "public"."nova_challenges" to "anon";

grant insert on table "public"."nova_challenges" to "anon";

grant references on table "public"."nova_challenges" to "anon";

grant select on table "public"."nova_challenges" to "anon";

grant trigger on table "public"."nova_challenges" to "anon";

grant truncate on table "public"."nova_challenges" to "anon";

grant update on table "public"."nova_challenges" to "anon";

grant delete on table "public"."nova_challenges" to "authenticated";

grant insert on table "public"."nova_challenges" to "authenticated";

grant references on table "public"."nova_challenges" to "authenticated";


grant trigger on table "public"."nova_challenges" to "authenticated";

grant truncate on table "public"."nova_challenges" to "authenticated";

grant update on table "public"."nova_challenges" to "authenticated";

grant delete on table "public"."nova_challenges" to "service_role";

grant insert on table "public"."nova_challenges" to "service_role";

grant references on table "public"."nova_challenges" to "service_role";

grant select on table "public"."nova_challenges" to "service_role";

grant trigger on table "public"."nova_challenges" to "service_role";

grant truncate on table "public"."nova_challenges" to "service_role";

grant update on table "public"."nova_challenges" to "service_role";


