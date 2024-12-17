drop policy "Allow read access if user is the chat creator or chat is public" on "public"."ai_chats";

alter table "public"."ai_chats" add column "latest_summarized_message_id" uuid;

alter table "public"."ai_chats" add column "summary" text;

alter table "public"."ai_chats" add constraint "public_ai_chats_latest_summarized_message_id_fkey" FOREIGN KEY (latest_summarized_message_id) REFERENCES ai_chat_messages(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."ai_chats" validate constraint "public_ai_chats_latest_summarized_message_id_fkey";

create policy "Allow read access if user is the chat creator"
on "public"."ai_chats"
as permissive
for select
to authenticated
using ((auth.uid() = creator_id));



