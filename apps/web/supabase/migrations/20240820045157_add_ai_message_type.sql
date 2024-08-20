create type "public"."ai_message_type" as enum ('message', 'summary', 'notes', 'multi_choice_quiz', 'paragraph_quiz', 'flashcards');

alter table "public"."ai_chat_messages" add column "type" ai_message_type not null default 'message'::ai_message_type;