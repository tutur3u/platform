create table "public"."ai_chat_members" (
    "chat_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "email" text not null
);


alter table "public"."ai_chat_members" enable row level security;

CREATE UNIQUE INDEX ai_chat_members_pkey ON public.ai_chat_members USING btree (chat_id, email);

alter table "public"."ai_chat_members" add constraint "ai_chat_members_pkey" PRIMARY KEY using index "ai_chat_members_pkey";

alter table "public"."ai_chat_members" add constraint "ai_chat_members_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES ai_chats(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."ai_chat_members" validate constraint "ai_chat_members_chat_id_fkey";

grant delete on table "public"."ai_chat_members" to "anon";

grant insert on table "public"."ai_chat_members" to "anon";

grant references on table "public"."ai_chat_members" to "anon";

grant select on table "public"."ai_chat_members" to "anon";

grant trigger on table "public"."ai_chat_members" to "anon";

grant truncate on table "public"."ai_chat_members" to "anon";

grant update on table "public"."ai_chat_members" to "anon";

grant delete on table "public"."ai_chat_members" to "authenticated";

grant insert on table "public"."ai_chat_members" to "authenticated";

grant references on table "public"."ai_chat_members" to "authenticated";

grant select on table "public"."ai_chat_members" to "authenticated";

grant trigger on table "public"."ai_chat_members" to "authenticated";

grant truncate on table "public"."ai_chat_members" to "authenticated";

grant update on table "public"."ai_chat_members" to "authenticated";

grant delete on table "public"."ai_chat_members" to "service_role";

grant insert on table "public"."ai_chat_members" to "service_role";

grant references on table "public"."ai_chat_members" to "service_role";

grant select on table "public"."ai_chat_members" to "service_role";

grant trigger on table "public"."ai_chat_members" to "service_role";

grant truncate on table "public"."ai_chat_members" to "service_role";

grant update on table "public"."ai_chat_members" to "service_role";

create policy "Allow chat owners to have full permissions"
on "public"."ai_chat_members"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM ai_chats ac
  WHERE ((ac.id = ai_chat_members.chat_id) AND (ac.creator_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM ai_chats ac
  WHERE ((ac.id = ai_chat_members.chat_id) AND (ac.creator_id = auth.uid())))));


create policy "Enable read access for current chat member"
on "public"."ai_chat_members"
as permissive
for select
to authenticated
using ((auth.email() = email));



