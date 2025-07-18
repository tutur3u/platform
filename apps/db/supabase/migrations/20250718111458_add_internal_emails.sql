create table "public"."internal_emails" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "user_id" uuid not null,
    "source_email" text not null,
    "subject" text not null,
    "to_addresses" text[] not null,
    "cc_addresses" text[] not null,
    "bcc_addresses" text[] not null,
    "reply_to_addresses" text[] not null,
    "payload" text not null,
    "html_payload" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."internal_emails" enable row level security;

CREATE UNIQUE INDEX internal_emails_pkey ON public.internal_emails USING btree (id);

alter table "public"."internal_emails" add constraint "internal_emails_pkey" PRIMARY KEY using index "internal_emails_pkey";

alter table "public"."internal_emails" add constraint "internal_emails_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."internal_emails" validate constraint "internal_emails_user_id_fkey";

alter table "public"."internal_emails" add constraint "internal_emails_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."internal_emails" validate constraint "internal_emails_ws_id_fkey";

grant delete on table "public"."internal_emails" to "anon";

grant insert on table "public"."internal_emails" to "anon";

grant references on table "public"."internal_emails" to "anon";

grant select on table "public"."internal_emails" to "anon";

grant trigger on table "public"."internal_emails" to "anon";

grant truncate on table "public"."internal_emails" to "anon";

grant update on table "public"."internal_emails" to "anon";

grant delete on table "public"."internal_emails" to "authenticated";

grant insert on table "public"."internal_emails" to "authenticated";

grant references on table "public"."internal_emails" to "authenticated";

grant select on table "public"."internal_emails" to "authenticated";

grant trigger on table "public"."internal_emails" to "authenticated";

grant truncate on table "public"."internal_emails" to "authenticated";

grant update on table "public"."internal_emails" to "authenticated";

grant delete on table "public"."internal_emails" to "service_role";

grant insert on table "public"."internal_emails" to "service_role";

grant references on table "public"."internal_emails" to "service_role";

grant select on table "public"."internal_emails" to "service_role";

grant trigger on table "public"."internal_emails" to "service_role";

grant truncate on table "public"."internal_emails" to "service_role";

grant update on table "public"."internal_emails" to "service_role";

create policy "Internal users can view emails"
on "public"."internal_emails"
as permissive
for select
to authenticated
using (((user_id = auth.uid()) AND is_org_member(user_id, '00000000-0000-0000-0000-000000000000'::uuid)));



