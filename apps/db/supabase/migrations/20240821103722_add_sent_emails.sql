create table "public"."sent_emails" (
    "id" uuid not null default gen_random_uuid(),
    "sender_id" uuid not null,
    "receiver_id" uuid not null,
    "source_name" text not null,
    "source_email" text not null,
    "post_id" uuid not null,
    "email" text not null,
    "content" text not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."sent_emails" enable row level security;

CREATE UNIQUE INDEX sent_emails_pkey ON public.sent_emails USING btree (id);

alter table "public"."sent_emails" add constraint "sent_emails_pkey" PRIMARY KEY using index "sent_emails_pkey";

alter table "public"."sent_emails" add constraint "sent_emails_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES workspace_users(id) not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_receiver_id_fkey";

alter table "public"."sent_emails" add constraint "sent_emails_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES workspace_users(id) not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_sender_id_fkey";

grant delete on table "public"."sent_emails" to "anon";

grant insert on table "public"."sent_emails" to "anon";

grant references on table "public"."sent_emails" to "anon";

grant select on table "public"."sent_emails" to "anon";

grant trigger on table "public"."sent_emails" to "anon";

grant truncate on table "public"."sent_emails" to "anon";

grant update on table "public"."sent_emails" to "anon";

grant delete on table "public"."sent_emails" to "authenticated";

grant insert on table "public"."sent_emails" to "authenticated";

grant references on table "public"."sent_emails" to "authenticated";

grant select on table "public"."sent_emails" to "authenticated";

grant trigger on table "public"."sent_emails" to "authenticated";

grant truncate on table "public"."sent_emails" to "authenticated";

grant update on table "public"."sent_emails" to "authenticated";

grant delete on table "public"."sent_emails" to "service_role";

grant insert on table "public"."sent_emails" to "service_role";

grant references on table "public"."sent_emails" to "service_role";

grant select on table "public"."sent_emails" to "service_role";

grant trigger on table "public"."sent_emails" to "service_role";

grant truncate on table "public"."sent_emails" to "service_role";

grant update on table "public"."sent_emails" to "service_role";

alter table "public"."sent_emails" drop constraint "sent_emails_sender_id_fkey";

alter table "public"."sent_emails" alter column "post_id" drop not null;

alter table "public"."sent_emails" add constraint "sent_emails_post_id_fkey" FOREIGN KEY (post_id) REFERENCES user_group_posts(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_post_id_fkey";

alter table "public"."sent_emails" add constraint "sent_emails_sender_id_fkey1" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_sender_id_fkey1";

create policy "Enable read access for workspace members"
on "public"."sent_emails"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id))));

alter table "public"."sent_emails" add column "subject" text not null;

drop policy "Enable read access for workspace members" on "public"."sent_emails";

create policy "Enable read access for workspace members"
on "public"."sent_emails"
as permissive
for select
to authenticated
using (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))));

alter table "public"."sent_emails" add constraint "sent_emails_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_sender_id_fkey";