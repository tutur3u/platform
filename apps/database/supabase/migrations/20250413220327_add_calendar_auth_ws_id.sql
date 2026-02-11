alter table "public"."calendar_auth_tokens" add column "ws_id" uuid not null;

alter table "public"."calendar_auth_tokens" add constraint "calendar_auth_tokens_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."calendar_auth_tokens" validate constraint "calendar_auth_tokens_ws_id_fkey";


