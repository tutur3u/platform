alter table "public"."meet_together_guests" drop constraint "meet_together_guests_plan_id_fkey";
alter table "public"."meet_together_guests" drop constraint "meet_together_guests_pkey";
drop index if exists "public"."meet_together_guests_pkey";
create table "public"."meet_together_guest_timeblocks" (
    "plan_id" uuid not null,
    "user_id" uuid not null,
    "date" date not null,
    "start_time" time with time zone not null,
    "end_time" time with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "id" uuid not null default gen_random_uuid()
);
alter table "public"."meet_together_guest_timeblocks" enable row level security;
create table "public"."meet_together_user_timeblocks" (
    "plan_id" uuid not null,
    "user_id" uuid not null,
    "date" date not null,
    "start_time" time with time zone not null,
    "end_time" time with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "id" uuid not null default gen_random_uuid()
);
alter table "public"."meet_together_user_timeblocks" enable row level security;
alter table "public"."meet_together_guests"
add column "id" uuid not null default gen_random_uuid();
CREATE UNIQUE INDEX meet_together_guest_timeblocks_pkey ON public.meet_together_guest_timeblocks USING btree (id);
CREATE UNIQUE INDEX meet_together_user_timeblocks_pkey ON public.meet_together_user_timeblocks USING btree (id);
CREATE UNIQUE INDEX meet_together_guests_pkey ON public.meet_together_guests USING btree (id);
alter table "public"."meet_together_guest_timeblocks"
add constraint "meet_together_guest_timeblocks_pkey" PRIMARY KEY using index "meet_together_guest_timeblocks_pkey";
alter table "public"."meet_together_user_timeblocks"
add constraint "meet_together_user_timeblocks_pkey" PRIMARY KEY using index "meet_together_user_timeblocks_pkey";
alter table "public"."meet_together_guests"
add constraint "meet_together_guests_pkey" PRIMARY KEY using index "meet_together_guests_pkey";
alter table "public"."meet_together_guest_timeblocks"
add constraint "meet_together_guest_timeblocks_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES meet_together_plans(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."meet_together_guest_timeblocks" validate constraint "meet_together_guest_timeblocks_plan_id_fkey";
alter table "public"."meet_together_guest_timeblocks"
add constraint "meet_together_guest_timeblocks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES meet_together_guests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."meet_together_guest_timeblocks" validate constraint "meet_together_guest_timeblocks_user_id_fkey";
alter table "public"."meet_together_user_timeblocks"
add constraint "meet_together_user_timeblocks_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES meet_together_plans(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."meet_together_user_timeblocks" validate constraint "meet_together_user_timeblocks_plan_id_fkey";
alter table "public"."meet_together_user_timeblocks"
add constraint "meet_together_user_timeblocks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."meet_together_user_timeblocks" validate constraint "meet_together_user_timeblocks_user_id_fkey";
alter table "public"."meet_together_guests"
add constraint "meet_together_guests_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES meet_together_plans(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."meet_together_guests" validate constraint "meet_together_guests_plan_id_fkey";
grant delete on table "public"."meet_together_guest_timeblocks" to "anon";
grant insert on table "public"."meet_together_guest_timeblocks" to "anon";
grant references on table "public"."meet_together_guest_timeblocks" to "anon";
grant select on table "public"."meet_together_guest_timeblocks" to "anon";
grant trigger on table "public"."meet_together_guest_timeblocks" to "anon";
grant truncate on table "public"."meet_together_guest_timeblocks" to "anon";
grant update on table "public"."meet_together_guest_timeblocks" to "anon";
grant delete on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant insert on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant references on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant select on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant trigger on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant truncate on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant update on table "public"."meet_together_guest_timeblocks" to "authenticated";
grant delete on table "public"."meet_together_guest_timeblocks" to "service_role";
grant insert on table "public"."meet_together_guest_timeblocks" to "service_role";
grant references on table "public"."meet_together_guest_timeblocks" to "service_role";
grant select on table "public"."meet_together_guest_timeblocks" to "service_role";
grant trigger on table "public"."meet_together_guest_timeblocks" to "service_role";
grant truncate on table "public"."meet_together_guest_timeblocks" to "service_role";
grant update on table "public"."meet_together_guest_timeblocks" to "service_role";
grant delete on table "public"."meet_together_user_timeblocks" to "anon";
grant insert on table "public"."meet_together_user_timeblocks" to "anon";
grant references on table "public"."meet_together_user_timeblocks" to "anon";
grant select on table "public"."meet_together_user_timeblocks" to "anon";
grant trigger on table "public"."meet_together_user_timeblocks" to "anon";
grant truncate on table "public"."meet_together_user_timeblocks" to "anon";
grant update on table "public"."meet_together_user_timeblocks" to "anon";
grant delete on table "public"."meet_together_user_timeblocks" to "authenticated";
grant insert on table "public"."meet_together_user_timeblocks" to "authenticated";
grant references on table "public"."meet_together_user_timeblocks" to "authenticated";
grant select on table "public"."meet_together_user_timeblocks" to "authenticated";
grant trigger on table "public"."meet_together_user_timeblocks" to "authenticated";
grant truncate on table "public"."meet_together_user_timeblocks" to "authenticated";
grant update on table "public"."meet_together_user_timeblocks" to "authenticated";
grant delete on table "public"."meet_together_user_timeblocks" to "service_role";
grant insert on table "public"."meet_together_user_timeblocks" to "service_role";
grant references on table "public"."meet_together_user_timeblocks" to "service_role";
grant select on table "public"."meet_together_user_timeblocks" to "service_role";
grant trigger on table "public"."meet_together_user_timeblocks" to "service_role";
grant truncate on table "public"."meet_together_user_timeblocks" to "service_role";
grant update on table "public"."meet_together_user_timeblocks" to "service_role";
alter table "public"."meet_together_guests"
add constraint "meet_together_guests_id_name_unique" UNIQUE (id, name);