drop trigger if exists "audit_i_u_d" on "public"."workspace_documents";

drop trigger if exists "audit_t" on "public"."workspace_documents";

drop policy "Enable all access for organization members" on "public"."workspace_documents";

revoke delete on table "public"."workspace_documents_block" from "anon";

revoke insert on table "public"."workspace_documents_block" from "anon";

revoke references on table "public"."workspace_documents_block" from "anon";

revoke select on table "public"."workspace_documents_block" from "anon";

revoke trigger on table "public"."workspace_documents_block" from "anon";

revoke truncate on table "public"."workspace_documents_block" from "anon";

revoke update on table "public"."workspace_documents_block" from "anon";

revoke delete on table "public"."workspace_documents_block" from "authenticated";

revoke insert on table "public"."workspace_documents_block" from "authenticated";

revoke references on table "public"."workspace_documents_block" from "authenticated";

revoke select on table "public"."workspace_documents_block" from "authenticated";

revoke trigger on table "public"."workspace_documents_block" from "authenticated";

revoke truncate on table "public"."workspace_documents_block" from "authenticated";

revoke update on table "public"."workspace_documents_block" from "authenticated";

revoke delete on table "public"."workspace_documents_block" from "service_role";

revoke insert on table "public"."workspace_documents_block" from "service_role";

revoke references on table "public"."workspace_documents_block" from "service_role";

revoke select on table "public"."workspace_documents_block" from "service_role";

revoke trigger on table "public"."workspace_documents_block" from "service_role";

revoke truncate on table "public"."workspace_documents_block" from "service_role";

revoke update on table "public"."workspace_documents_block" from "service_role";

revoke delete on table "public"."workspace_documents_block_attributes" from "anon";

revoke insert on table "public"."workspace_documents_block_attributes" from "anon";

revoke references on table "public"."workspace_documents_block_attributes" from "anon";

revoke select on table "public"."workspace_documents_block_attributes" from "anon";

revoke trigger on table "public"."workspace_documents_block_attributes" from "anon";

revoke truncate on table "public"."workspace_documents_block_attributes" from "anon";

revoke update on table "public"."workspace_documents_block_attributes" from "anon";

revoke delete on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke insert on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke references on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke select on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke trigger on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke truncate on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke update on table "public"."workspace_documents_block_attributes" from "authenticated";

revoke delete on table "public"."workspace_documents_block_attributes" from "service_role";

revoke insert on table "public"."workspace_documents_block_attributes" from "service_role";

revoke references on table "public"."workspace_documents_block_attributes" from "service_role";

revoke select on table "public"."workspace_documents_block_attributes" from "service_role";

revoke trigger on table "public"."workspace_documents_block_attributes" from "service_role";

revoke truncate on table "public"."workspace_documents_block_attributes" from "service_role";

revoke update on table "public"."workspace_documents_block_attributes" from "service_role";

alter table "public"."workspace_documents_block" drop constraint "workspace_documents_block_document_id_fkey";

alter table "public"."workspace_documents_block_attributes" drop constraint "workspace_documents_block_attributes_block_id_fkey";

alter table "public"."workspace_documents" drop constraint "workspace_documents_ws_id_fkey";

alter table "public"."workspace_documents" drop constraint "project_documents_pkey";

alter table "public"."workspace_documents_block" drop constraint "workspace_documents_block_pkey";

alter table "public"."workspace_documents_block_attributes" drop constraint "workspace_documents_block_attributes_pkey";

drop index if exists "public"."project_documents_pkey";

drop index if exists "public"."workspace_documents_block_attributes_pkey";

drop index if exists "public"."workspace_documents_block_pkey";

drop table "public"."workspace_documents_block";

drop table "public"."workspace_documents_block_attributes";

alter table "public"."workspace_documents" rename column "content" to "legacy_content";

alter table "public"."workspace_documents" add column "content" jsonb;

alter table "public"."workspace_documents" alter column "created_at" set not null;

alter table "public"."workspace_documents" alter column "id" set default gen_random_uuid();

alter table "public"."workspace_documents" alter column "is_public" drop not null;

alter table "public"."workspace_documents" alter column "name" drop default;

alter table "public"."workspace_documents" alter column "ws_id" set default gen_random_uuid();

alter table "public"."workspace_documents" alter column "ws_id" drop not null;

CREATE UNIQUE INDEX workspace_documents_pkey ON public.workspace_documents USING btree (id);

alter table "public"."workspace_documents" add constraint "workspace_documents_pkey" PRIMARY KEY using index "workspace_documents_pkey";

alter table "public"."workspace_documents" add constraint "workspace_documents_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) not valid;

alter table "public"."workspace_documents" validate constraint "workspace_documents_ws_id_fkey";