create type "public"."chat_role" as enum ('FUNCTION', 'USER', 'SYSTEM', 'ASSISTANT');
create table "public"."ai_chat_messages" (
    "id" uuid not null default gen_random_uuid(),
    "chat_id" uuid not null,
    "content" text,
    "creator_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "role" chat_role not null
);
alter table "public"."ai_chat_messages" enable row level security;
create table "public"."ai_chats" (
    "id" uuid not null default gen_random_uuid(),
    "title" text default ''::text,
    "creator_id" uuid,
    "created_at" timestamp with time zone not null default now()
);
alter table "public"."ai_chats" enable row level security;
CREATE UNIQUE INDEX ai_chat_messages_pkey ON public.ai_chat_messages USING btree (id);
CREATE UNIQUE INDEX ai_chats_pkey ON public.ai_chats USING btree (id);
alter table "public"."ai_chat_messages"
add constraint "ai_chat_messages_pkey" PRIMARY KEY using index "ai_chat_messages_pkey";
alter table "public"."ai_chats"
add constraint "ai_chats_pkey" PRIMARY KEY using index "ai_chats_pkey";
alter table "public"."ai_chat_messages"
add constraint "ai_chat_messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES ai_chats(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."ai_chat_messages" validate constraint "ai_chat_messages_chat_id_fkey";
alter table "public"."ai_chat_messages"
add constraint "ai_chat_messages_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."ai_chat_messages" validate constraint "ai_chat_messages_creator_id_fkey";
alter table "public"."ai_chats"
add constraint "ai_chats_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE
SET DEFAULT not valid;
alter table "public"."ai_chats" validate constraint "ai_chats_creator_id_fkey";
create policy "Allow read for users that have access to the chat" on "public"."ai_chat_messages" as permissive for
select to authenticated using (
        (
            EXISTS (
                SELECT 1
                FROM ai_chats ac
                WHERE (ac.id = ai_chat_messages.chat_id)
            )
        )
    );
create policy "Allow delete if user is the chat creator" on "public"."ai_chats" as permissive for delete to authenticated using ((auth.uid() = creator_id));
create policy "Allow read access if user is the chat creator" on "public"."ai_chats" as permissive for
select to authenticated using ((auth.uid() = creator_id));
create policy "Enable insert for authenticated users only" on "public"."ai_chats" as permissive for
insert to authenticated with check ((auth.uid() = creator_id));
-- Create a function that takes in a message and insert that one into ai_chat_messages with system permission and role set to 'USER'
create or replace function "public"."insert_ai_chat_message" (message text, chat_id uuid) returns void as $$ begin
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (chat_id, message, auth.uid(), 'USER');
end;
$$ language plpgsql security definer;
-- Create a function that takes in an initial message and create a chat with that message
-- Make to store the chat id in the function so that the messages can be inserted into the chat
-- Return the chat id at the end of the function
drop function if exists "public"."create_ai_chat" (message text);
create or replace function "public"."create_ai_chat" (title text, message text) returns uuid as $$
declare generated_chat_id uuid;
begin generated_chat_id := gen_random_uuid();
insert into ai_chats (id, title, creator_id)
values (generated_chat_id, title, auth.uid());
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (generated_chat_id, message, auth.uid(), 'USER');
return generated_chat_id;
end;
$$ language plpgsql security definer;