create table "public"."internal_email_api_keys" (
    "id" uuid not null default gen_random_uuid(),
    "creator_id" uuid not null,
    "user_id" uuid not null,
    "value" text not null,
    "allowed_emails" text[],
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."internal_email_api_keys" enable row level security;

CREATE UNIQUE INDEX internal_email_api_keys_pkey ON public.internal_email_api_keys USING btree (id);

CREATE UNIQUE INDEX internal_email_api_keys_user_id_key ON public.internal_email_api_keys USING btree (user_id);

alter table "public"."internal_email_api_keys" add constraint "internal_email_api_keys_pkey" PRIMARY KEY using index "internal_email_api_keys_pkey";

alter table "public"."internal_email_api_keys" add constraint "internal_email_api_keys_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."internal_email_api_keys" validate constraint "internal_email_api_keys_creator_id_fkey";

alter table "public"."internal_email_api_keys" add constraint "internal_email_api_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."internal_email_api_keys" validate constraint "internal_email_api_keys_user_id_fkey";

alter table "public"."internal_email_api_keys" add constraint "internal_email_api_keys_user_id_key" UNIQUE using index "internal_email_api_keys_user_id_key";

grant delete on table "public"."internal_email_api_keys" to "anon";

grant insert on table "public"."internal_email_api_keys" to "anon";

grant references on table "public"."internal_email_api_keys" to "anon";

grant select on table "public"."internal_email_api_keys" to "anon";

grant trigger on table "public"."internal_email_api_keys" to "anon";

grant truncate on table "public"."internal_email_api_keys" to "anon";

grant update on table "public"."internal_email_api_keys" to "anon";

grant delete on table "public"."internal_email_api_keys" to "authenticated";

grant insert on table "public"."internal_email_api_keys" to "authenticated";

grant references on table "public"."internal_email_api_keys" to "authenticated";

grant select on table "public"."internal_email_api_keys" to "authenticated";

grant trigger on table "public"."internal_email_api_keys" to "authenticated";

grant truncate on table "public"."internal_email_api_keys" to "authenticated";

grant update on table "public"."internal_email_api_keys" to "authenticated";

grant delete on table "public"."internal_email_api_keys" to "service_role";

grant insert on table "public"."internal_email_api_keys" to "service_role";

grant references on table "public"."internal_email_api_keys" to "service_role";

grant select on table "public"."internal_email_api_keys" to "service_role";

grant trigger on table "public"."internal_email_api_keys" to "service_role";

grant truncate on table "public"."internal_email_api_keys" to "service_role";

grant update on table "public"."internal_email_api_keys" to "service_role";

create policy "Enable read access for authenticated users"
on "public"."internal_email_api_keys"
as permissive
for select
to authenticated
using (user_id = auth.uid() AND is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000'));
