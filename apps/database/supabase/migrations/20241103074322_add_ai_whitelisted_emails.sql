create table "public"."ai_whitelisted_emails" (
    "email" text not null,
    "enabled" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."ai_whitelisted_emails" enable row level security;

CREATE UNIQUE INDEX ai_whitelisted_emails_pkey ON public.ai_whitelisted_emails USING btree (email);

alter table "public"."ai_whitelisted_emails" add constraint "ai_whitelisted_emails_pkey" PRIMARY KEY using index "ai_whitelisted_emails_pkey";

grant delete on table "public"."ai_whitelisted_emails" to "anon";

grant insert on table "public"."ai_whitelisted_emails" to "anon";

grant references on table "public"."ai_whitelisted_emails" to "anon";

grant select on table "public"."ai_whitelisted_emails" to "anon";

grant trigger on table "public"."ai_whitelisted_emails" to "anon";

grant truncate on table "public"."ai_whitelisted_emails" to "anon";

grant update on table "public"."ai_whitelisted_emails" to "anon";

grant delete on table "public"."ai_whitelisted_emails" to "authenticated";

grant insert on table "public"."ai_whitelisted_emails" to "authenticated";

grant references on table "public"."ai_whitelisted_emails" to "authenticated";

grant select on table "public"."ai_whitelisted_emails" to "authenticated";

grant trigger on table "public"."ai_whitelisted_emails" to "authenticated";

grant truncate on table "public"."ai_whitelisted_emails" to "authenticated";

grant update on table "public"."ai_whitelisted_emails" to "authenticated";

grant delete on table "public"."ai_whitelisted_emails" to "service_role";

grant insert on table "public"."ai_whitelisted_emails" to "service_role";

grant references on table "public"."ai_whitelisted_emails" to "service_role";

grant select on table "public"."ai_whitelisted_emails" to "service_role";

grant trigger on table "public"."ai_whitelisted_emails" to "service_role";

grant truncate on table "public"."ai_whitelisted_emails" to "service_role";

grant update on table "public"."ai_whitelisted_emails" to "service_role";


