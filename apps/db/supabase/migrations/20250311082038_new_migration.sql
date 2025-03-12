create table "public"."nova_rankings" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "user_id" uuid,
    "total_raw_score" real,
    "total_real_score" real,
    "updated_at" timestamp without time zone default now()
);


alter table "public"."nova_rankings" enable row level security;

CREATE UNIQUE INDEX nova_rankings_pkey ON public.nova_rankings USING btree (id);

alter table "public"."nova_rankings" add constraint "nova_rankings_pkey" PRIMARY KEY using index "nova_rankings_pkey";

alter table "public"."nova_rankings" add constraint "nova_rankings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_rankings" validate constraint "nova_rankings_user_id_fkey";

grant delete on table "public"."nova_rankings" to "anon";

grant insert on table "public"."nova_rankings" to "anon";

grant references on table "public"."nova_rankings" to "anon";

grant select on table "public"."nova_rankings" to "anon";

grant trigger on table "public"."nova_rankings" to "anon";

grant truncate on table "public"."nova_rankings" to "anon";

grant update on table "public"."nova_rankings" to "anon";

grant delete on table "public"."nova_rankings" to "authenticated";

grant insert on table "public"."nova_rankings" to "authenticated";

grant references on table "public"."nova_rankings" to "authenticated";

grant select on table "public"."nova_rankings" to "authenticated";

grant trigger on table "public"."nova_rankings" to "authenticated";

grant truncate on table "public"."nova_rankings" to "authenticated";

grant update on table "public"."nova_rankings" to "authenticated";

grant delete on table "public"."nova_rankings" to "service_role";

grant insert on table "public"."nova_rankings" to "service_role";

grant references on table "public"."nova_rankings" to "service_role";

grant select on table "public"."nova_rankings" to "service_role";

grant trigger on table "public"."nova_rankings" to "service_role";

grant truncate on table "public"."nova_rankings" to "service_role";

grant update on table "public"."nova_rankings" to "service_role";


