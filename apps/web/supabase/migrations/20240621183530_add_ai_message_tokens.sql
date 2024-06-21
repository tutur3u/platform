alter table "public"."ai_chat_messages" add column "completion_tokens" integer not null default 0;

alter table "public"."ai_chat_messages" add column "finish_reason" text;

alter table "public"."ai_chat_messages" add column "prompt_tokens" integer not null default 0;


