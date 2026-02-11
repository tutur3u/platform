create table "public"."workspace_whiteboards" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "description" text,
    "snapshot" jsonb,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "thumbnail_url" text,
    "updated_at" timestamp with time zone not null default now(),
    "creator_id" uuid not null
);

alter table "public"."workspace_whiteboards" enable row level security;

CREATE UNIQUE INDEX workspace_whiteboards_pkey ON public.workspace_whiteboards USING btree (id);

alter table "public"."workspace_whiteboards" add constraint "workspace_whiteboards_pkey" PRIMARY KEY using index "workspace_whiteboards_pkey";

alter table "public"."workspace_whiteboards" add constraint "workspace_whiteboards_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_whiteboards" validate constraint "workspace_whiteboards_creator_id_fkey";

alter table "public"."workspace_whiteboards" add constraint "workspace_whiteboards_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_whiteboards" validate constraint "workspace_whiteboards_ws_id_fkey";

grant delete on table "public"."workspace_whiteboards" to "anon";

grant insert on table "public"."workspace_whiteboards" to "anon";

grant references on table "public"."workspace_whiteboards" to "anon";

grant select on table "public"."workspace_whiteboards" to "anon";

grant trigger on table "public"."workspace_whiteboards" to "anon";

grant truncate on table "public"."workspace_whiteboards" to "anon";

grant update on table "public"."workspace_whiteboards" to "anon";

grant delete on table "public"."workspace_whiteboards" to "authenticated";

grant insert on table "public"."workspace_whiteboards" to "authenticated";

grant references on table "public"."workspace_whiteboards" to "authenticated";

grant select on table "public"."workspace_whiteboards" to "authenticated";

grant trigger on table "public"."workspace_whiteboards" to "authenticated";

grant truncate on table "public"."workspace_whiteboards" to "authenticated";

grant update on table "public"."workspace_whiteboards" to "authenticated";

grant delete on table "public"."workspace_whiteboards" to "service_role";

grant insert on table "public"."workspace_whiteboards" to "service_role";

grant references on table "public"."workspace_whiteboards" to "service_role";

grant select on table "public"."workspace_whiteboards" to "service_role";

grant trigger on table "public"."workspace_whiteboards" to "service_role";

grant truncate on table "public"."workspace_whiteboards" to "service_role";

grant update on table "public"."workspace_whiteboards" to "service_role";

-- Add an index to improve join performance
CREATE INDEX IF NOT EXISTS idx_whiteboards_ws_id ON workspace_whiteboards(ws_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_creator_id ON workspace_whiteboards(creator_id);

CREATE INDEX idx_whiteboards_snapshot_gin ON public.workspace_whiteboards USING GIN (snapshot);

CREATE POLICY "Workspace members can read and write whiteboards" ON public.workspace_whiteboards
    FOR ALL TO authenticated
    USING (
        ws_id IN (
            SELECT ws_id FROM public.workspace_members 
            WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        ws_id IN (
            SELECT ws_id FROM public.workspace_members 
            WHERE user_id = auth.uid()
        )
    );