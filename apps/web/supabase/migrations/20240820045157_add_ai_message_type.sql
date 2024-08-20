create type "public"."ai_message_type" as enum ('message', 'summary', 'notes', 'multi_choice_quiz', 'paragraph_quiz', 'flashcards');

alter table "public"."ai_chat_messages" add column "type" ai_message_type not null default 'message'::ai_message_type;

alter table "public"."ai_chat_messages" alter column "type" drop default;

alter type "public"."ai_message_type" rename to "ai_message_type__old_version_to_be_dropped";

create type "public"."ai_message_type" as enum ('message', 'file', 'summary', 'notes', 'multi_choice_quiz', 'paragraph_quiz', 'flashcards');

alter table "public"."ai_chat_messages" alter column type type "public"."ai_message_type" using type::text::"public"."ai_message_type";

alter table "public"."ai_chat_messages" alter column "type" set default 'message'::ai_message_type;

drop type "public"."ai_message_type__old_version_to_be_dropped";

alter table "public"."ai_chat_messages" add column "metadata" jsonb;