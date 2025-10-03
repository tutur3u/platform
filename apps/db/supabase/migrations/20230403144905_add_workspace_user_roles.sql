-- Add public.workspace_user_roles table
CREATE TABLE "public"."workspace_user_roles" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp with time zone default now()
);
ALTER TABLE "public"."workspace_user_roles"
ADD CONSTRAINT "workspace_user_roles_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."workspace_user_roles"
ADD CONSTRAINT "workspace_user_roles_ws_id_fkey" FOREIGN KEY ("ws_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
CREATE INDEX "workspace_user_roles_ws_id_index" ON "public"."workspace_user_roles" ("ws_id");
-- Add public.workspace_user_roles_users table
CREATE TABLE "public"."workspace_user_roles_users" (
    "user_id" uuid NOT NULL,
    "role_id" uuid NOT NULL,
    "created_at" timestamp with time zone default now()
);
ALTER TABLE "public"."workspace_user_roles_users"
ADD CONSTRAINT "workspace_user_roles_users_pkey" PRIMARY KEY ("user_id", "role_id");
ALTER TABLE "public"."workspace_user_roles_users"
ADD CONSTRAINT "workspace_user_roles_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE CASCADE;
ALTER TABLE "public"."workspace_user_roles_users"
ADD CONSTRAINT "workspace_user_roles_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."workspace_user_roles"("id") ON DELETE CASCADE;
CREATE INDEX "workspace_user_roles_users_role_id_index" ON "public"."workspace_user_roles_users" ("role_id");
-- Enable RLS on both tables
ALTER TABLE "public"."workspace_user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_user_roles_users" ENABLE ROW LEVEL SECURITY;
-- Add RLS policy to workspace_user_roles
create policy "Enable all access for organization members" on "public"."workspace_user_roles" as permissive for all to authenticated using (is_org_member(auth.uid(), ws_id)) with check (is_org_member(auth.uid(), ws_id));
-- Add RLS policy to workspace_user_roles_users
create policy "Enable all access for organization members" on "public"."workspace_user_roles_users" as permissive for all to authenticated using (
    is_org_member(
        auth.uid(),
        (
            select ws_id
            from workspace_user_roles
            where id = role_id
        )
    )
) with check (
    is_org_member(
        auth.uid(),
        (
            select ws_id
            from workspace_user_roles
            where id = role_id
        )
    )
);