alter table "public"."workspace_invites" drop constraint "workspace_invites_user_id_fkey";
alter table "public"."workspace_invites" drop constraint "workspace_invites_ws_id_fkey";
alter table "public"."workspace_invites"
add constraint "workspace_invites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_invites" validate constraint "workspace_invites_user_id_fkey";
alter table "public"."workspace_invites"
add constraint "workspace_invites_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_invites" validate constraint "workspace_invites_ws_id_fkey";