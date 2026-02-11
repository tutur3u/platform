alter table "public"."user_private_details" add column "default_workspace_id" uuid;

alter table "public"."user_private_details" add constraint "user_private_details_default_workspace_id_fkey" FOREIGN KEY (default_workspace_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."user_private_details" validate constraint "user_private_details_default_workspace_id_fkey";


