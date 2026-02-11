create type "public"."workspace_api_key_scope" as enum ('gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-pro', 'gemini-2.5-pro');

create table "public"."workspace_ai_executions" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "api_key_id" uuid not null,
    "system_prompt" text not null,
    "input" text not null,
    "output" text not null,
    "input_tokens" integer not null,
    "output_tokens" integer not null,
    "reasoning_tokens" integer not null,
    "total_tokens" integer not null,
    "finish_reason" text not null,
    "created_at" timestamp with time zone not null default now(),
    "model_id" text not null
);


alter table "public"."workspace_ai_executions" enable row level security;

alter table "public"."workspace_api_keys" add column "scopes" workspace_api_key_scope[] not null default '{}'::workspace_api_key_scope[];

CREATE UNIQUE INDEX workspace_ai_executions_pkey ON public.workspace_ai_executions USING btree (id);

alter table "public"."workspace_ai_executions" add constraint "workspace_ai_executions_pkey" PRIMARY KEY using index "workspace_ai_executions_pkey";

alter table "public"."workspace_ai_executions" add constraint "workspace_ai_executions_api_key_fkey" FOREIGN KEY (api_key_id) REFERENCES workspace_api_keys(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_ai_executions" validate constraint "workspace_ai_executions_api_key_fkey";

alter table "public"."workspace_ai_executions" add constraint "workspace_ai_executions_model_id_fkey" FOREIGN KEY (model_id) REFERENCES ai_models(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_ai_executions" validate constraint "workspace_ai_executions_model_id_fkey";

alter table "public"."workspace_ai_executions" add constraint "workspace_ai_executions_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_ai_executions" validate constraint "workspace_ai_executions_ws_id_fkey";

grant delete on table "public"."workspace_ai_executions" to "anon";

grant insert on table "public"."workspace_ai_executions" to "anon";

grant references on table "public"."workspace_ai_executions" to "anon";

grant select on table "public"."workspace_ai_executions" to "anon";

grant trigger on table "public"."workspace_ai_executions" to "anon";

grant truncate on table "public"."workspace_ai_executions" to "anon";

grant update on table "public"."workspace_ai_executions" to "anon";

grant delete on table "public"."workspace_ai_executions" to "authenticated";

grant insert on table "public"."workspace_ai_executions" to "authenticated";

grant references on table "public"."workspace_ai_executions" to "authenticated";

grant select on table "public"."workspace_ai_executions" to "authenticated";

grant trigger on table "public"."workspace_ai_executions" to "authenticated";

grant truncate on table "public"."workspace_ai_executions" to "authenticated";

grant update on table "public"."workspace_ai_executions" to "authenticated";

grant delete on table "public"."workspace_ai_executions" to "service_role";

grant insert on table "public"."workspace_ai_executions" to "service_role";

grant references on table "public"."workspace_ai_executions" to "service_role";

grant select on table "public"."workspace_ai_executions" to "service_role";

grant trigger on table "public"."workspace_ai_executions" to "service_role";

grant truncate on table "public"."workspace_ai_executions" to "service_role";

grant update on table "public"."workspace_ai_executions" to "service_role";


