create table "public"."nova_challenge_whitelisted_emails" (
    "challenge_id" uuid not null,
    "email" text not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."nova_challenge_whitelisted_emails" enable row level security;

CREATE UNIQUE INDEX nova_challenge_whitelisted_emails_pkey ON public.nova_challenge_whitelisted_emails USING btree (challenge_id, email);

alter table "public"."nova_challenge_whitelisted_emails" add constraint "nova_challenge_whitelisted_emails_pkey" PRIMARY KEY using index "nova_challenge_whitelisted_emails_pkey";

alter table "public"."nova_challenge_whitelisted_emails" add constraint "nova_challenge_whitelisted_emails_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_challenge_whitelisted_emails" validate constraint "nova_challenge_whitelisted_emails_challenge_id_fkey";

grant delete on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant insert on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant references on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant select on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant trigger on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant truncate on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant update on table "public"."nova_challenge_whitelisted_emails" to "anon";

grant delete on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant insert on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant references on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant select on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant trigger on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant truncate on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant update on table "public"."nova_challenge_whitelisted_emails" to "authenticated";

grant delete on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant insert on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant references on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant select on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant trigger on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant truncate on table "public"."nova_challenge_whitelisted_emails" to "service_role";

grant update on table "public"."nova_challenge_whitelisted_emails" to "service_role";


