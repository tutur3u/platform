drop policy "Allow read access if user is the chat creator" on "public"."ai_chats";

alter table "public"."ai_chats" add column "is_public" boolean not null default false;

create policy "Allow read access if user is the chat creator or chat is public"
on "public"."ai_chats"
as permissive
for select
to authenticated
using (((auth.uid() = creator_id) OR (is_public = true)));


create policy "Enable update for chat creator"
on "public"."ai_chats"
as permissive
for update
to authenticated
using ((creator_id = auth.uid()))
with check ((creator_id = auth.uid()));



