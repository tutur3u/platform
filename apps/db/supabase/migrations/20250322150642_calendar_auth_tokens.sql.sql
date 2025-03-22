create table "public"."calendar_auth_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "access_token" text not null,
    "refresh_token" text not null,
    "created_at" timestamp without time zone not null default now()
);


alter table "public"."calendar_auth_tokens" enable row level security;

CREATE UNIQUE INDEX calendar_auth_tokens_pkey ON public.calendar_auth_tokens USING btree (id);

alter table "public"."calendar_auth_tokens" add constraint "calendar_auth_tokens_pkey" PRIMARY KEY using index "calendar_auth_tokens_pkey";

alter table "public"."calendar_auth_tokens" add constraint "calendar_auth_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."calendar_auth_tokens" validate constraint "calendar_auth_tokens_user_id_fkey";

grant delete on table "public"."calendar_auth_tokens" to "anon";

grant insert on table "public"."calendar_auth_tokens" to "anon";

grant references on table "public"."calendar_auth_tokens" to "anon";

grant select on table "public"."calendar_auth_tokens" to "anon";

grant trigger on table "public"."calendar_auth_tokens" to "anon";

grant truncate on table "public"."calendar_auth_tokens" to "anon";

grant update on table "public"."calendar_auth_tokens" to "anon";

grant delete on table "public"."calendar_auth_tokens" to "authenticated";

grant insert on table "public"."calendar_auth_tokens" to "authenticated";

grant references on table "public"."calendar_auth_tokens" to "authenticated";

grant select on table "public"."calendar_auth_tokens" to "authenticated";

grant trigger on table "public"."calendar_auth_tokens" to "authenticated";

grant truncate on table "public"."calendar_auth_tokens" to "authenticated";

grant update on table "public"."calendar_auth_tokens" to "authenticated";

grant delete on table "public"."calendar_auth_tokens" to "service_role";

grant insert on table "public"."calendar_auth_tokens" to "service_role";

grant references on table "public"."calendar_auth_tokens" to "service_role";

grant select on table "public"."calendar_auth_tokens" to "service_role";

grant trigger on table "public"."calendar_auth_tokens" to "service_role";

grant truncate on table "public"."calendar_auth_tokens" to "service_role";

grant update on table "public"."calendar_auth_tokens" to "service_role";


