drop policy "Enable all access for workspace users" on "public"."user_group_post_checks";

create table "public"."send_emails" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "sender_id" uuid not null,
    "receiver_id" uuid not null,
    "content" text
);


alter table "public"."send_emails" enable row level security;

alter table "public"."ai_chat_messages" drop column "metadata";

alter table "public"."ai_chat_messages" drop column "type";

alter table "public"."user_group_post_checks" disable row level security;

drop type "public"."ai_message_type";

CREATE UNIQUE INDEX send_emails_pkey ON public.send_emails USING btree (id);

alter table "public"."send_emails" add constraint "send_emails_pkey" PRIMARY KEY using index "send_emails_pkey";

alter table "public"."send_emails" add constraint "send_emails_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES workspace_users(id) not valid;

alter table "public"."send_emails" validate constraint "send_emails_receiver_id_fkey";

alter table "public"."send_emails" add constraint "send_emails_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES workspace_users(id) not valid;

alter table "public"."send_emails" validate constraint "send_emails_sender_id_fkey";

grant delete on table "public"."send_emails" to "anon";

grant insert on table "public"."send_emails" to "anon";

grant references on table "public"."send_emails" to "anon";

grant select on table "public"."send_emails" to "anon";

grant trigger on table "public"."send_emails" to "anon";

grant truncate on table "public"."send_emails" to "anon";

grant update on table "public"."send_emails" to "anon";

grant delete on table "public"."send_emails" to "authenticated";

grant insert on table "public"."send_emails" to "authenticated";

grant references on table "public"."send_emails" to "authenticated";

grant select on table "public"."send_emails" to "authenticated";

grant trigger on table "public"."send_emails" to "authenticated";

grant truncate on table "public"."send_emails" to "authenticated";

grant update on table "public"."send_emails" to "authenticated";

grant delete on table "public"."send_emails" to "service_role";

grant insert on table "public"."send_emails" to "service_role";

grant references on table "public"."send_emails" to "service_role";

grant select on table "public"."send_emails" to "service_role";

grant trigger on table "public"."send_emails" to "service_role";

grant truncate on table "public"."send_emails" to "service_role";

grant update on table "public"."send_emails" to "service_role";


