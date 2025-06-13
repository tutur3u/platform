create table "public"."workspace_ai_prompts" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "input" text not null,
    "output" text not null,
    "model" text not null,
    "ws_id" uuid,
    "creator_id" uuid not null default auth.uid(),
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."workspace_ai_prompts" enable row level security;

CREATE UNIQUE INDEX workspace_ai_prompts_pkey ON public.workspace_ai_prompts USING btree (id);

alter table "public"."workspace_ai_prompts" add constraint "workspace_ai_prompts_pkey" PRIMARY KEY using index "workspace_ai_prompts_pkey";

alter table "public"."workspace_ai_prompts" add constraint "public_workspace_ai_prompts_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE not valid;

alter table "public"."workspace_ai_prompts" validate constraint "public_workspace_ai_prompts_creator_id_fkey";

alter table "public"."workspace_ai_prompts" add constraint "public_workspace_ai_prompts_model_fkey" FOREIGN KEY (model) REFERENCES ai_models(id) ON UPDATE CASCADE not valid;

alter table "public"."workspace_ai_prompts" validate constraint "public_workspace_ai_prompts_model_fkey";

alter table "public"."workspace_ai_prompts" add constraint "public_workspace_ai_prompts_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_ai_prompts" validate constraint "public_workspace_ai_prompts_ws_id_fkey";

grant delete on table "public"."workspace_ai_prompts" to "anon";

grant insert on table "public"."workspace_ai_prompts" to "anon";

grant references on table "public"."workspace_ai_prompts" to "anon";

grant select on table "public"."workspace_ai_prompts" to "anon";

grant trigger on table "public"."workspace_ai_prompts" to "anon";

grant truncate on table "public"."workspace_ai_prompts" to "anon";

grant update on table "public"."workspace_ai_prompts" to "anon";

grant delete on table "public"."workspace_ai_prompts" to "authenticated";

grant insert on table "public"."workspace_ai_prompts" to "authenticated";

grant references on table "public"."workspace_ai_prompts" to "authenticated";

grant select on table "public"."workspace_ai_prompts" to "authenticated";

grant trigger on table "public"."workspace_ai_prompts" to "authenticated";

grant truncate on table "public"."workspace_ai_prompts" to "authenticated";

grant update on table "public"."workspace_ai_prompts" to "authenticated";

grant delete on table "public"."workspace_ai_prompts" to "service_role";

grant insert on table "public"."workspace_ai_prompts" to "service_role";

grant references on table "public"."workspace_ai_prompts" to "service_role";

grant select on table "public"."workspace_ai_prompts" to "service_role";

grant trigger on table "public"."workspace_ai_prompts" to "service_role";

grant truncate on table "public"."workspace_ai_prompts" to "service_role";

grant update on table "public"."workspace_ai_prompts" to "service_role";

alter table "public"."workspace_ai_prompts" drop constraint "public_workspace_ai_prompts_creator_id_fkey";

alter table "public"."ai_models" add column "enabled" boolean not null default false;

alter table "public"."workspace_ai_prompts" alter column "creator_id" drop not null;

alter table "public"."workspace_ai_prompts" add constraint "public_workspace_ai_prompts_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."workspace_ai_prompts" validate constraint "public_workspace_ai_prompts_creator_id_fkey";

create policy "Allow all access for workspace users"
on "public"."workspace_ai_prompts"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces ws
  WHERE (ws.id = workspace_ai_prompts.ws_id))));
