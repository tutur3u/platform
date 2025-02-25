create table "public"."nova_problems" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "challenge_id" uuid,
    "title" text,
    "description" text,
    "exampleInput" text,
    "exampleOutput" text
);


alter table "public"."nova_problems" enable row level security;

CREATE UNIQUE INDEX nova_problems_pkey ON public.nova_problems USING btree (id);

alter table "public"."nova_problems" add constraint "nova_problems_pkey" PRIMARY KEY using index "nova_problems_pkey";

alter table "public"."nova_problems" add constraint "nova_problems_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_problems" validate constraint "nova_problems_challenge_id_fkey";

grant delete on table "public"."nova_problems" to "anon";

grant insert on table "public"."nova_problems" to "anon";

grant references on table "public"."nova_problems" to "anon";

grant select on table "public"."nova_problems" to "anon";

grant trigger on table "public"."nova_problems" to "anon";

grant truncate on table "public"."nova_problems" to "anon";

grant update on table "public"."nova_problems" to "anon";

grant delete on table "public"."nova_problems" to "authenticated";

grant insert on table "public"."nova_problems" to "authenticated";

grant references on table "public"."nova_problems" to "authenticated";

grant select on table "public"."nova_problems" to "authenticated";

grant trigger on table "public"."nova_problems" to "authenticated";

grant truncate on table "public"."nova_problems" to "authenticated";

grant update on table "public"."nova_problems" to "authenticated";

grant delete on table "public"."nova_problems" to "service_role";

grant insert on table "public"."nova_problems" to "service_role";

grant references on table "public"."nova_problems" to "service_role";

grant select on table "public"."nova_problems" to "service_role";

grant trigger on table "public"."nova_problems" to "service_role";

grant truncate on table "public"."nova_problems" to "service_role";

grant update on table "public"."nova_problems" to "service_role";


