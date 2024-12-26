create table "public"."meet_together_guests" (
    "plan_id" uuid not null,
    "name" text not null,
    "password_hash" text not null,
    "created_at" timestamp with time zone not null default now(),
    "password_salt" text not null
);


alter table "public"."meet_together_guests" enable row level security;

CREATE UNIQUE INDEX meet_together_guests_pkey ON public.meet_together_guests USING btree (plan_id, name);

alter table "public"."meet_together_guests" add constraint "meet_together_guests_pkey" PRIMARY KEY using index "meet_together_guests_pkey";

alter table "public"."meet_together_guests" add constraint "meet_together_guests_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES meet_together_plans(id) not valid;

alter table "public"."meet_together_guests" validate constraint "meet_together_guests_plan_id_fkey";

grant delete on table "public"."meet_together_guests" to "anon";

grant insert on table "public"."meet_together_guests" to "anon";

grant references on table "public"."meet_together_guests" to "anon";

grant select on table "public"."meet_together_guests" to "anon";

grant trigger on table "public"."meet_together_guests" to "anon";

grant truncate on table "public"."meet_together_guests" to "anon";

grant update on table "public"."meet_together_guests" to "anon";

grant delete on table "public"."meet_together_guests" to "authenticated";

grant insert on table "public"."meet_together_guests" to "authenticated";

grant references on table "public"."meet_together_guests" to "authenticated";

grant select on table "public"."meet_together_guests" to "authenticated";

grant trigger on table "public"."meet_together_guests" to "authenticated";

grant truncate on table "public"."meet_together_guests" to "authenticated";

grant update on table "public"."meet_together_guests" to "authenticated";

grant delete on table "public"."meet_together_guests" to "service_role";

grant insert on table "public"."meet_together_guests" to "service_role";

grant references on table "public"."meet_together_guests" to "service_role";

grant select on table "public"."meet_together_guests" to "service_role";

grant trigger on table "public"."meet_together_guests" to "service_role";

grant truncate on table "public"."meet_together_guests" to "service_role";

grant update on table "public"."meet_together_guests" to "service_role";


