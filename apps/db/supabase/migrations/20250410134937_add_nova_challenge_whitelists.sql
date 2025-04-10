create table "public"."nova_challenge_whitelists" (
    "challenge_id" uuid not null,
    "email" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_challenge_whitelists" enable row level security;

CREATE UNIQUE INDEX nova_challenge_whitelists_pkey ON public.nova_challenge_whitelists USING btree (challenge_id, email);

alter table "public"."nova_challenge_whitelists" add constraint "nova_challenge_whitelists_pkey" PRIMARY KEY using index "nova_challenge_whitelists_pkey";

alter table "public"."nova_challenge_whitelists" add constraint "nova_challenge_whitelists_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_challenge_whitelists" validate constraint "nova_challenge_whitelists_challenge_id_fkey";

grant delete on table "public"."nova_challenge_whitelists" to "anon";

grant insert on table "public"."nova_challenge_whitelists" to "anon";

grant references on table "public"."nova_challenge_whitelists" to "anon";

grant select on table "public"."nova_challenge_whitelists" to "anon";

grant trigger on table "public"."nova_challenge_whitelists" to "anon";

grant truncate on table "public"."nova_challenge_whitelists" to "anon";

grant update on table "public"."nova_challenge_whitelists" to "anon";

grant delete on table "public"."nova_challenge_whitelists" to "authenticated";

grant insert on table "public"."nova_challenge_whitelists" to "authenticated";

grant references on table "public"."nova_challenge_whitelists" to "authenticated";

grant select on table "public"."nova_challenge_whitelists" to "authenticated";

grant trigger on table "public"."nova_challenge_whitelists" to "authenticated";

grant truncate on table "public"."nova_challenge_whitelists" to "authenticated";

grant update on table "public"."nova_challenge_whitelists" to "authenticated";

grant delete on table "public"."nova_challenge_whitelists" to "service_role";

grant insert on table "public"."nova_challenge_whitelists" to "service_role";

grant references on table "public"."nova_challenge_whitelists" to "service_role";

grant select on table "public"."nova_challenge_whitelists" to "service_role";

grant trigger on table "public"."nova_challenge_whitelists" to "service_role";

grant truncate on table "public"."nova_challenge_whitelists" to "service_role";

grant update on table "public"."nova_challenge_whitelists" to "service_role";


