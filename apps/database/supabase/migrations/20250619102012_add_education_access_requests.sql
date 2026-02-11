-- Create workspace education access requests table
create table "public"."workspace_education_access_requests" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "workspace_name" text not null,
    "creator_id" uuid not null,
    "message" text not null,
    "status" text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    "admin_notes" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

-- Enable RLS
alter table "public"."workspace_education_access_requests" enable row level security;

-- Create indexes
CREATE UNIQUE INDEX workspace_education_access_requests_pkey ON public.workspace_education_access_requests USING btree (id);
CREATE INDEX workspace_education_access_requests_ws_id_idx ON public.workspace_education_access_requests USING btree (ws_id);
CREATE INDEX workspace_education_access_requests_status_idx ON public.workspace_education_access_requests USING btree (status);
CREATE INDEX workspace_education_access_requests_created_at_idx ON public.workspace_education_access_requests USING btree (created_at);

-- Add constraints
alter table "public"."workspace_education_access_requests" add constraint "workspace_education_access_requests_pkey" PRIMARY KEY using index "workspace_education_access_requests_pkey";

alter table "public"."workspace_education_access_requests" add constraint "workspace_education_access_requests_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_education_access_requests" validate constraint "workspace_education_access_requests_ws_id_fkey";

alter table "public"."workspace_education_access_requests" add constraint "workspace_education_access_requests_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."workspace_education_access_requests" validate constraint "workspace_education_access_requests_creator_id_fkey";

alter table "public"."workspace_education_access_requests" add constraint "workspace_education_access_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."workspace_education_access_requests" validate constraint "workspace_education_access_requests_reviewed_by_fkey";

-- Prevent duplicate pending requests for the same workspace
CREATE UNIQUE INDEX workspace_education_access_requests_unique_pending ON public.workspace_education_access_requests USING btree (ws_id) WHERE status = 'pending';

-- Grant permissions
grant delete on table "public"."workspace_education_access_requests" to "anon";
grant insert on table "public"."workspace_education_access_requests" to "anon";
grant references on table "public"."workspace_education_access_requests" to "anon";
grant select on table "public"."workspace_education_access_requests" to "anon";
grant trigger on table "public"."workspace_education_access_requests" to "anon";
grant truncate on table "public"."workspace_education_access_requests" to "anon";
grant update on table "public"."workspace_education_access_requests" to "anon";

grant delete on table "public"."workspace_education_access_requests" to "authenticated";
grant insert on table "public"."workspace_education_access_requests" to "authenticated";
grant references on table "public"."workspace_education_access_requests" to "authenticated";
grant select on table "public"."workspace_education_access_requests" to "authenticated";
grant trigger on table "public"."workspace_education_access_requests" to "authenticated";
grant truncate on table "public"."workspace_education_access_requests" to "authenticated";
grant update on table "public"."workspace_education_access_requests" to "authenticated";

grant delete on table "public"."workspace_education_access_requests" to "service_role";
grant insert on table "public"."workspace_education_access_requests" to "service_role";
grant references on table "public"."workspace_education_access_requests" to "service_role";
grant select on table "public"."workspace_education_access_requests" to "service_role";
grant trigger on table "public"."workspace_education_access_requests" to "service_role";
grant truncate on table "public"."workspace_education_access_requests" to "service_role";
grant update on table "public"."workspace_education_access_requests" to "service_role";

-- RLS Policies
-- Allow workspace owners to view their own requests
create policy "Enable workspace owners to view own requests"
on "public"."workspace_education_access_requests"
as permissive
for select
to authenticated
using (
  creator_id = auth.uid() 
  OR 
  (
    ws_id IN (
      SELECT ws_id 
      FROM workspace_members 
      WHERE user_id = auth.uid() 
      AND role IN ('OWNER', 'ADMIN')
    )
  )
);

-- Allow workspace owners to create requests
create policy "Enable workspace owners to create requests"
on "public"."workspace_education_access_requests"
as permissive
for insert
to authenticated
with check (
  creator_id = auth.uid() 
  AND 
  ws_id IN (
    SELECT ws_id 
    FROM workspace_members 
    WHERE user_id = auth.uid() 
    AND role = 'OWNER'
  )
);

-- Only allow platform admins (root workspace) to review/update requests
create policy "Enable platform admins to update requests"
on "public"."workspace_education_access_requests"
as permissive
for update
to authenticated
using (
  auth.uid() IN (
    SELECT user_id 
    FROM workspace_members 
    WHERE ws_id = '00000000-0000-0000-0000-000000000000' 
    AND role IN ('OWNER', 'ADMIN')
  )
)
with check (
  auth.uid() IN (
    SELECT user_id 
    FROM workspace_members 
    WHERE ws_id = '00000000-0000-0000-0000-000000000000' 
    AND role IN ('OWNER', 'ADMIN')
  )
);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_education_access_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER workspace_education_access_requests_updated_at
    BEFORE UPDATE ON workspace_education_access_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_education_access_requests_updated_at();
