-- Create realtime_logs table for tracking realtime events
create table if not exists "public"."realtime_logs" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid,
    "user_id" uuid,
    "kind" text not null,
    "message" text not null,
    "data" text,
    "created_at" timestamptz not null default now()
);

-- Enable RLS
alter table "public"."realtime_logs" enable row level security;

-- Add indexes for common queries
CREATE UNIQUE INDEX realtime_logs_id_pkey ON public.realtime_logs using btree (id);
CREATE INDEX realtime_logs_user_id_key ON public.realtime_logs using btree (user_id);
CREATE INDEX realtime_logs_ws_id_created_at_idx ON public.realtime_logs using btree (ws_id, created_at DESC);

alter table "public"."realtime_logs" add constraint "realtime_logs_id_pkey" PRIMARY KEY using index "realtime_logs_id_pkey";
alter table "public"."realtime_logs" add constraint "realtime_logs_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."realtime_logs" add constraint "realtime_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."realtime_logs" validate constraint "realtime_logs_ws_id_fkey";
alter table "public"."realtime_logs" validate constraint "realtime_logs_user_id_fkey";

-- Policy: Users can view logs for their workspaces
create policy "Users can view logs for their workspaces"
on "public"."realtime_logs"
as permissive
for select
to authenticated
using (
    (EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE ws_id = realtime_logs.ws_id
        AND user_id = auth.uid()
    )) OR
    (EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr ON wrm.role_id = wr.id
        WHERE wr.ws_id = realtime_logs.ws_id
        AND wrm.user_id = auth.uid()
        AND wr.name IN ('OWNER', 'ADMIN')
    ))
);