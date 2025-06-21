alter table "public"."ai_models" drop constraint "ai_models_provider_fkey";

alter table "public"."ai_models" add constraint "public_ai_models_provider_fkey" FOREIGN KEY (provider) REFERENCES ai_providers(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."ai_models" validate constraint "public_ai_models_provider_fkey";

alter table "public"."ai_chat_messages" drop constraint "ai_chat_messages_model_fkey";

alter table "public"."ai_chats" drop constraint "ai_chats_model_fkey";

alter table "public"."ai_chat_messages" add constraint "public_ai_chat_messages_model_fkey" FOREIGN KEY (model) REFERENCES ai_models(id) ON UPDATE CASCADE not valid;

alter table "public"."ai_chat_messages" validate constraint "public_ai_chat_messages_model_fkey";

alter table "public"."ai_chats" add constraint "public_ai_chats_model_fkey" FOREIGN KEY (model) REFERENCES ai_models(id) ON UPDATE CASCADE not valid;

alter table "public"."ai_chats" validate constraint "public_ai_chats_model_fkey";

UPDATE public.ai_models
SET id = 'claude-2.1'
WHERE id = 'CLAUDE-2.1';

UPDATE public.ai_models
SET id = 'gemini-1.0-pro'
WHERE id = 'GOOGLE-GEMINI-PRO';

UPDATE public.ai_models
SET name = 'Gemini 1.0 Pro'
WHERE name = 'Gemini Pro';

INSERT INTO public.ai_models (id, provider, name)
VALUES ('gemini-1.5-pro', 'GOOGLE', 'Gemini 1.5 Pro'),
       ('gemini-1.5-flash', 'GOOGLE', 'Gemini 1.5 Flash');

INSERT INTO public.ai_providers (id, name)
VALUES ('COHERE', 'Cohere'), ('FIREWORKS', 'Fireworks'), ('META', 'Meta'), ('MISTRAL', 'Mistral');