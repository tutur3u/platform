-- Workspace calendar categories for event categorization
-- Categories are workspace-wide (shared by all members) with custom ordering

CREATE TABLE "public"."workspace_calendar_categories" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "ws_id" uuid NOT NULL,
    "name" text NOT NULL,
    "color" text NOT NULL DEFAULT 'BLUE',
    "position" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE "public"."workspace_calendar_categories" ENABLE ROW LEVEL SECURITY;

-- Primary key
CREATE UNIQUE INDEX workspace_calendar_categories_pkey
ON public.workspace_calendar_categories USING btree (id);

ALTER TABLE "public"."workspace_calendar_categories"
ADD CONSTRAINT "workspace_calendar_categories_pkey"
PRIMARY KEY USING INDEX "workspace_calendar_categories_pkey";

-- Unique constraint on name per workspace (case-insensitive)
CREATE UNIQUE INDEX workspace_calendar_categories_ws_id_name_unique
ON public.workspace_calendar_categories USING btree (ws_id, lower(name));

-- Foreign key constraints
ALTER TABLE "public"."workspace_calendar_categories"
ADD CONSTRAINT "workspace_calendar_categories_ws_id_fkey"
FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE "public"."workspace_calendar_categories"
ADD CONSTRAINT "workspace_calendar_categories_color_fkey"
FOREIGN KEY (color) REFERENCES calendar_event_colors(value) ON DELETE SET DEFAULT;

-- Indexes for performance
CREATE INDEX workspace_calendar_categories_ws_id_idx
ON public.workspace_calendar_categories USING btree (ws_id);

CREATE INDEX workspace_calendar_categories_position_idx
ON public.workspace_calendar_categories USING btree (ws_id, position);

-- RLS Policies
CREATE POLICY "Allow workspace members to read categories"
ON "public"."workspace_calendar_categories" AS PERMISSIVE FOR SELECT
TO authenticated USING (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_calendar_categories.ws_id
        AND wm.user_id = auth.uid()
    )
);

CREATE POLICY "Allow workspace members to insert categories"
ON "public"."workspace_calendar_categories" AS PERMISSIVE FOR INSERT
TO authenticated WITH CHECK (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_calendar_categories.ws_id
        AND wm.user_id = auth.uid()
    )
);

CREATE POLICY "Allow workspace members to update categories"
ON "public"."workspace_calendar_categories" AS PERMISSIVE FOR UPDATE
TO authenticated USING (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_calendar_categories.ws_id
        AND wm.user_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_calendar_categories.ws_id
        AND wm.user_id = auth.uid()
    )
);

CREATE POLICY "Allow workspace members to delete categories"
ON "public"."workspace_calendar_categories" AS PERMISSIVE FOR DELETE
TO authenticated USING (
    EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.ws_id = workspace_calendar_categories.ws_id
        AND wm.user_id = auth.uid()
    )
);

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_calendar_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_calendar_categories_updated_at_trigger
    BEFORE UPDATE ON workspace_calendar_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_calendar_categories_updated_at();
