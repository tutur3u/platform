CREATE INDEX IF NOT EXISTS workspace_user_groups_users_user_id_idx
  ON "public"."workspace_user_groups_users" ("user_id");

CREATE INDEX IF NOT EXISTS workspace_user_linked_users_virtual_user_id_idx
  ON "public"."workspace_user_linked_users" ("virtual_user_id");

-- Useful for quickly scoping groups by workspace
CREATE INDEX IF NOT EXISTS workspace_user_groups_ws_id_idx
  ON "public"."workspace_user_groups" ("ws_id");

-- Text-search optimisations on users' names
CREATE INDEX IF NOT EXISTS workspace_users_full_name_trgm_idx
  ON "public"."workspace_users" USING gin ("full_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS workspace_users_display_name_trgm_idx
  ON "public"."workspace_users" USING gin ("display_name" gin_trgm_ops);

-- Composite index to serve ORDER BY full_name after filtering by ws_id
CREATE INDEX IF NOT EXISTS workspace_users_ws_id_full_name_idx
  ON "public"."workspace_users" ("ws_id", "full_name"); 