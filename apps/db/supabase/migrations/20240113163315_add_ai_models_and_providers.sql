create table "public"."ai_models" (
    "id" text not null,
    "provider" text,
    "name" text,
    "created_at" timestamp with time zone not null default now()
);
alter table "public"."ai_models" enable row level security;
create table "public"."ai_providers" (
    "id" text not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
);
alter table "public"."ai_providers" enable row level security;
alter table "public"."ai_chats"
add column "model" text;
CREATE UNIQUE INDEX ai_models_pkey ON public.ai_models USING btree (id);
CREATE UNIQUE INDEX ai_providers_name_key ON public.ai_providers USING btree (name);
CREATE UNIQUE INDEX ai_providers_pkey ON public.ai_providers USING btree (id);
alter table "public"."ai_models"
add constraint "ai_models_pkey" PRIMARY KEY using index "ai_models_pkey";
alter table "public"."ai_providers"
add constraint "ai_providers_pkey" PRIMARY KEY using index "ai_providers_pkey";
alter table "public"."ai_chats"
add constraint "ai_chats_model_fkey" FOREIGN KEY (model) REFERENCES ai_models(id) not valid;
alter table "public"."ai_chats" validate constraint "ai_chats_model_fkey";
alter table "public"."ai_models"
add constraint "ai_models_provider_fkey" FOREIGN KEY (provider) REFERENCES ai_providers(id) not valid;
alter table "public"."ai_models" validate constraint "ai_models_provider_fkey";
alter table "public"."ai_providers"
add constraint "ai_providers_name_key" UNIQUE using index "ai_providers_name_key";
grant delete on table "public"."ai_models" to "anon";
grant insert on table "public"."ai_models" to "anon";
grant references on table "public"."ai_models" to "anon";
grant select on table "public"."ai_models" to "anon";
grant trigger on table "public"."ai_models" to "anon";
grant truncate on table "public"."ai_models" to "anon";
grant update on table "public"."ai_models" to "anon";
grant delete on table "public"."ai_models" to "authenticated";
grant insert on table "public"."ai_models" to "authenticated";
grant references on table "public"."ai_models" to "authenticated";
grant select on table "public"."ai_models" to "authenticated";
grant trigger on table "public"."ai_models" to "authenticated";
grant truncate on table "public"."ai_models" to "authenticated";
grant update on table "public"."ai_models" to "authenticated";
grant delete on table "public"."ai_models" to "service_role";
grant insert on table "public"."ai_models" to "service_role";
grant references on table "public"."ai_models" to "service_role";
grant select on table "public"."ai_models" to "service_role";
grant trigger on table "public"."ai_models" to "service_role";
grant truncate on table "public"."ai_models" to "service_role";
grant update on table "public"."ai_models" to "service_role";
grant delete on table "public"."ai_providers" to "anon";
grant insert on table "public"."ai_providers" to "anon";
grant references on table "public"."ai_providers" to "anon";
grant select on table "public"."ai_providers" to "anon";
grant trigger on table "public"."ai_providers" to "anon";
grant truncate on table "public"."ai_providers" to "anon";
grant update on table "public"."ai_providers" to "anon";
grant delete on table "public"."ai_providers" to "authenticated";
grant insert on table "public"."ai_providers" to "authenticated";
grant references on table "public"."ai_providers" to "authenticated";
grant select on table "public"."ai_providers" to "authenticated";
grant trigger on table "public"."ai_providers" to "authenticated";
grant truncate on table "public"."ai_providers" to "authenticated";
grant update on table "public"."ai_providers" to "authenticated";
grant delete on table "public"."ai_providers" to "service_role";
grant insert on table "public"."ai_providers" to "service_role";
grant references on table "public"."ai_providers" to "service_role";
grant select on table "public"."ai_providers" to "service_role";
grant trigger on table "public"."ai_providers" to "service_role";
grant truncate on table "public"."ai_providers" to "service_role";
grant update on table "public"."ai_providers" to "service_role";
drop function if exists "public"."create_ai_chat" (title text, message text);
insert into ai_providers (id, name)
values ('GOOGLE', 'Google'),
    ('ANTHROPIC', 'Anthropic'),
    ('OPENAI', 'OpenAI');
insert into ai_models (id, provider, name)
values ('CLAUDE-2.1', 'ANTHROPIC', 'Claude 2.1'),
    ('GOOGLE-GEMINI-PRO', 'GOOGLE', 'Gemini Pro');
-- for nullish models in ai_chats, set it to 'CLAUDE-2.1' as default
update ai_chats
set model = 'CLAUDE-2.1'
where model is null;
create or replace function "public"."create_ai_chat" (title text, message text, model text) returns uuid as $$
declare generated_chat_id uuid;
begin generated_chat_id := gen_random_uuid();
insert into ai_chats (id, title, creator_id, model)
values (generated_chat_id, title, auth.uid(), model);
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (generated_chat_id, message, auth.uid(), 'USER');
return generated_chat_id;
end;
$$ language plpgsql security definer;
alter table "public"."ai_chat_messages"
add column "model" text;
alter table "public"."ai_chat_messages"
add constraint "ai_chat_messages_model_fkey" FOREIGN KEY (model) REFERENCES ai_models(id) not valid;
alter table "public"."ai_chat_messages" validate constraint "ai_chat_messages_model_fkey";
update ai_chat_messages
set model = 'CLAUDE-2.1'
where model is null;