create table "public"."nova_test_timer_record" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "duration" bigint,
    "problemId" text,
    "userId" uuid,
    "test_status" text
);


alter table "public"."nova_test_timer_record" enable row level security;

CREATE UNIQUE INDEX nova_test_timer_record_pkey ON public.nova_test_timer_record USING btree (id);

alter table "public"."nova_test_timer_record" add constraint "nova_test_timer_record_pkey" PRIMARY KEY using index "nova_test_timer_record_pkey";

alter table "public"."nova_test_timer_record" add constraint "nova_test_timer_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) not valid;

alter table "public"."nova_test_timer_record" validate constraint "nova_test_timer_record_userId_fkey";

grant delete on table "public"."nova_test_timer_record" to "anon";

grant insert on table "public"."nova_test_timer_record" to "anon";

grant references on table "public"."nova_test_timer_record" to "anon";

grant select on table "public"."nova_test_timer_record" to "anon";

grant trigger on table "public"."nova_test_timer_record" to "anon";

grant truncate on table "public"."nova_test_timer_record" to "anon";

grant update on table "public"."nova_test_timer_record" to "anon";

grant delete on table "public"."nova_test_timer_record" to "authenticated";

grant insert on table "public"."nova_test_timer_record" to "authenticated";

grant references on table "public"."nova_test_timer_record" to "authenticated";

grant select on table "public"."nova_test_timer_record" to "authenticated";

grant trigger on table "public"."nova_test_timer_record" to "authenticated";

grant truncate on table "public"."nova_test_timer_record" to "authenticated";

grant update on table "public"."nova_test_timer_record" to "authenticated";

grant delete on table "public"."nova_test_timer_record" to "service_role";

grant insert on table "public"."nova_test_timer_record" to "service_role";

grant references on table "public"."nova_test_timer_record" to "service_role";

grant select on table "public"."nova_test_timer_record" to "service_role";

grant trigger on table "public"."nova_test_timer_record" to "service_role";

grant truncate on table "public"."nova_test_timer_record" to "service_role";

grant update on table "public"."nova_test_timer_record" to "service_role";


