-- Migration: Enhanced Time Tracking - Session Chains & Break Tracking
-- Description: Adds session chain tracking (parent_session_id), dedicated breaks table,
--              and workspace break type customization to differentiate pause from stop actions
-- Date: 2024-12-18

-- =====================================================
-- 1. ALTER time_tracking_sessions - Add Session Chain Tracking
-- =====================================================

-- Add parent_session_id to link resumed sessions back to their paused predecessors
alter table "public"."time_tracking_sessions"
  add column if not exists "parent_session_id" uuid references "public"."time_tracking_sessions"("id") on delete set null;

-- Create index for efficient chain traversal
create index if not exists "idx_time_tracking_sessions_parent_session_id" 
  on "public"."time_tracking_sessions"("parent_session_id");

-- Create index for querying root sessions (sessions without parents - start of chains)
create index if not exists "idx_time_tracking_sessions_root_sessions" 
  on "public"."time_tracking_sessions"("ws_id", "user_id", "start_time") 
  where "parent_session_id" is null;

-- Add comment explaining the session chain concept
comment on column "public"."time_tracking_sessions"."parent_session_id" is 
  'Links resumed sessions to their paused predecessor, creating session chains. NULL for root sessions (start of work period).';

-- =====================================================
-- 2. CREATE workspace_break_types - Custom Break Type Definitions
-- =====================================================

create table if not exists "public"."workspace_break_types" (
  "id" uuid primary key default gen_random_uuid(),
  "ws_id" uuid not null references "public"."workspaces"("id") on delete cascade,
  "name" text not null check (char_length("name") >= 1 and char_length("name") <= 50),
  "description" text,
  "color" text default 'AMBER' check ("color" in ('RED', 'ORANGE', 'AMBER', 'YELLOW', 'LIME', 'GREEN', 'EMERALD', 'TEAL', 'CYAN', 'SKY', 'BLUE', 'INDIGO', 'VIOLET', 'PURPLE', 'FUCHSIA', 'PINK', 'ROSE', 'SLATE', 'GRAY', 'ZINC', 'NEUTRAL', 'STONE')),
  "icon" text, -- lucide-react icon name (e.g., 'Coffee', 'Utensils', 'User', 'Users')
  "is_default" boolean default false, -- workspace-level default break type
  "is_system" boolean default false, -- system-provided types (coffee, lunch, personal, meeting)
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

-- Ensure unique break type names per workspace (case-insensitive)
create unique index if not exists "idx_workspace_break_types_ws_name_unique" 
  on "public"."workspace_break_types"("ws_id", lower("name"));

-- Only one default break type per workspace (using partial unique index)
create unique index if not exists "idx_workspace_break_types_single_default" 
  on "public"."workspace_break_types"("ws_id") 
  where "is_default" = true;

-- Create indexes for efficient queries
create index if not exists "idx_workspace_break_types_ws_id" 
  on "public"."workspace_break_types"("ws_id");

create index if not exists "idx_workspace_break_types_is_system" 
  on "public"."workspace_break_types"("ws_id", "is_system");

-- Enable RLS
alter table "public"."workspace_break_types" enable row level security;

-- RLS Policies: Users can view break types for workspaces they belong to
create policy "Users can view break types for workspaces they belong to"
  on "public"."workspace_break_types"
  for select
  using (
    exists (
      select 1 from "public"."workspace_members"
      where "workspace_members"."ws_id" = "workspace_break_types"."ws_id"
        and "workspace_members"."user_id" = auth.uid()
    )
  );

create policy "Users can insert break types for workspaces they belong to"
  on "public"."workspace_break_types"
  for insert
  with check (
    exists (
      select 1 from "public"."workspace_members"
      where "workspace_members"."ws_id" = "workspace_break_types"."ws_id"
        and "workspace_members"."user_id" = auth.uid()
    )
  );

create policy "Users can update break types for workspaces they belong to"
  on "public"."workspace_break_types"
  for update
  using (
    exists (
      select 1 from "public"."workspace_members"
      where "workspace_members"."ws_id" = "workspace_break_types"."ws_id"
        and "workspace_members"."user_id" = auth.uid()
    )
  );

create policy "Users can delete break types for workspaces they belong to"
  on "public"."workspace_break_types"
  for delete
  using (
    "is_system" = false
    and exists (
      select 1 from "public"."workspace_members"
      where "workspace_members"."ws_id" = "workspace_break_types"."ws_id"
        and "workspace_members"."user_id" = auth.uid()
    )
  );

-- Trigger to update updated_at timestamp
create or replace function "public"."update_workspace_break_types_updated_at"()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger "workspace_break_types_updated_at_trigger"
  before update on "public"."workspace_break_types"
  for each row
  execute function "public"."update_workspace_break_types_updated_at"();

-- =====================================================
-- 3. CREATE time_tracking_breaks - Dedicated Break Records
-- =====================================================

create table if not exists "public"."time_tracking_breaks" (
  "id" uuid primary key default gen_random_uuid(),
  "session_id" uuid not null references "public"."time_tracking_sessions"("id") on delete cascade,
  "break_type_id" uuid references "public"."workspace_break_types"("id") on delete set null,
  "break_type_name" text, -- Denormalized for historical data when break_type_id is null (custom user input or deleted type)
  "break_start" timestamp with time zone not null,
  "break_end" timestamp with time zone, -- NULL while break is active, set when resumed
  "break_duration_seconds" integer, -- Calculated on resume
  "notes" text, -- Optional user notes about the break
  "created_by" uuid not null references "auth"."users"("id") on delete cascade,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  
  -- Ensure break_end is after break_start
  constraint "time_tracking_breaks_valid_duration" check ("break_end" is null or "break_end" > "break_start"),
  
  -- Ensure break_duration_seconds matches calculated duration when both timestamps exist
  constraint "time_tracking_breaks_duration_match" check (
    "break_duration_seconds" is null 
    or "break_end" is null 
    or "break_duration_seconds" = extract(epoch from ("break_end" - "break_start"))::integer
  )
);

-- Create indexes for efficient queries
create index if not exists "idx_time_tracking_breaks_session_id" 
  on "public"."time_tracking_breaks"("session_id");

create index if not exists "idx_time_tracking_breaks_break_type_id" 
  on "public"."time_tracking_breaks"("break_type_id");

create index if not exists "idx_time_tracking_breaks_created_by" 
  on "public"."time_tracking_breaks"("created_by");

create index if not exists "idx_time_tracking_breaks_active" 
  on "public"."time_tracking_breaks"("session_id", "created_by") 
  where "break_end" is null;

-- Enable RLS
alter table "public"."time_tracking_breaks" enable row level security;

-- RLS Policies: Users can view breaks for sessions in their workspaces
create policy "Users can view breaks for sessions in their workspaces"
  on "public"."time_tracking_breaks"
  for select
  using (
    exists (
      select 1 from "public"."time_tracking_sessions" as "s"
      inner join "public"."workspace_members" as "wm"
        on "wm"."ws_id" = "s"."ws_id"
      where "s"."id" = "time_tracking_breaks"."session_id"
        and "wm"."user_id" = auth.uid()
    )
  );

-- Users can only create breaks for their own sessions
create policy "Users can only create breaks for their own sessions"
  on "public"."time_tracking_breaks"
  for insert
  with check (
    "created_by" = auth.uid()
    and exists (
      select 1 from "public"."time_tracking_sessions"
      where "id" = "time_tracking_breaks"."session_id"
        and "user_id" = auth.uid()
    )
  );

-- Users can only update their own breaks
create policy "Users can only update their own breaks"
  on "public"."time_tracking_breaks"
  for update
  using ("created_by" = auth.uid());

-- Users can only delete their own breaks
create policy "Users can only delete their own breaks"
  on "public"."time_tracking_breaks"
  for delete
  using ("created_by" = auth.uid());

-- Trigger to update updated_at timestamp
create or replace function "public"."update_time_tracking_breaks_updated_at"()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger "time_tracking_breaks_updated_at_trigger"
  before update on "public"."time_tracking_breaks"
  for each row
  execute function "public"."update_time_tracking_breaks_updated_at"();

-- Trigger to calculate break_duration_seconds when break_end is set
create or replace function "public"."calculate_time_tracking_break_duration"()
returns trigger as $$
begin
  if new.break_end is not null and new.break_start is not null then
    new.break_duration_seconds := extract(epoch from (new.break_end - new.break_start))::integer;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger "time_tracking_breaks_duration_trigger"
  before insert or update on "public"."time_tracking_breaks"
  for each row
  execute function "public"."calculate_time_tracking_break_duration"();

-- =====================================================
-- 5. FUNCTION - Get Session Chain Root (for threshold validation)
-- =====================================================

create or replace function "public"."get_session_chain_root"(
  "session_id_input" uuid
)
returns uuid as $$
declare
  "current_session_id" uuid := "session_id_input";
  "parent_id" uuid;
  "iteration_count" integer := 0;
  "max_iterations" integer := 100; -- Prevent infinite loops
begin
  -- Traverse up the chain to find root session
  loop
    select "parent_session_id" into "parent_id"
    from "public"."time_tracking_sessions"
    where "id" = "current_session_id";
    
    -- If no parent, we've reached the root
    if "parent_id" is null then
      return "current_session_id";
    end if;
    
    -- Move to parent
    "current_session_id" := "parent_id";
    
    -- Prevent infinite loops
    "iteration_count" := "iteration_count" + 1;
    if "iteration_count" >= "max_iterations" then
      raise exception 'Session chain depth exceeds maximum (possible circular reference)';
    end if;
  end loop;
end;
$$ language plpgsql stable;

comment on function "public"."get_session_chain_root"(uuid) is 
  'Traverses session chain to find the root session (first in work period). Used for threshold validation.';

-- =====================================================
-- 7. FUNCTION - Get Session Chain Summary (for approval UI)
-- =====================================================

create or replace function "public"."get_session_chain_summary"(
  "session_id_input" uuid
)
returns jsonb as $$
declare
  "root_session_id" uuid;
  "chain_data" jsonb;
begin
  -- Get root session
  "root_session_id" := "public"."get_session_chain_root"("session_id_input");
  
  -- Build comprehensive chain summary
  with recursive "session_chain" as (
    -- Start with root
    select 
      "s"."id",
      "s"."parent_session_id",
      "s"."title",
      "s"."description",
      "s"."start_time",
      "s"."end_time",
      "s"."duration_seconds",
      "s"."category_id",
      "s"."task_id",
      1 as "chain_position"
    from "public"."time_tracking_sessions" as "s"
    where "s"."id" = "root_session_id"
    
    union all
    
    -- Recursively get children
    select 
      "s"."id",
      "s"."parent_session_id",
      "s"."title",
      "s"."description",
      "s"."start_time",
      "s"."end_time",
      "s"."duration_seconds",
      "s"."category_id",
      "s"."task_id",
      "sc"."chain_position" + 1
    from "public"."time_tracking_sessions" as "s"
    inner join "session_chain" as "sc" on "s"."parent_session_id" = "sc"."id"
  ),
  "breaks_data" as (
    -- Get all breaks for sessions in chain
    select 
      "b"."id",
      "b"."session_id",
      "b"."break_type_name",
      "b"."break_start",
      "b"."break_end",
      "b"."break_duration_seconds",
      "bt"."name" as "break_type_name_resolved",
      "bt"."color" as "break_type_color",
      "bt"."icon" as "break_type_icon"
    from "public"."time_tracking_breaks" as "b"
    left join "public"."workspace_break_types" as "bt" on "bt"."id" = "b"."break_type_id"
    where "b"."session_id" in (select "id" from "session_chain")
  )
  select jsonb_build_object(
    'root_session_id', "root_session_id",
    'sessions', (
      select jsonb_agg(
        jsonb_build_object(
          'id', "sc"."id",
          'title', "sc"."title",
          'description', "sc"."description",
          'start_time', "sc"."start_time",
          'end_time', "sc"."end_time",
          'duration_seconds', "sc"."duration_seconds",
          'category_id', "sc"."category_id",
          'task_id', "sc"."task_id",
          'chain_position', "sc"."chain_position"
        )
        order by "sc"."chain_position"
      )
      from "session_chain" as "sc"
    ),
    'breaks', (
      select jsonb_agg(
        jsonb_build_object(
          'id', "bd"."id",
          'session_id', "bd"."session_id",
          'break_type_name', coalesce("bd"."break_type_name_resolved", "bd"."break_type_name", 'Break'),
          'break_start', "bd"."break_start",
          'break_end', "bd"."break_end",
          'break_duration_seconds', "bd"."break_duration_seconds",
          'break_type_color', "bd"."break_type_color",
          'break_type_icon', "bd"."break_type_icon"
        )
        order by "bd"."break_start"
      )
      from "breaks_data" as "bd"
    ),
    'total_work_seconds', (
      select coalesce(sum("duration_seconds"), 0)
      from "session_chain"
    ),
    'total_break_seconds', (
      select coalesce(sum("break_duration_seconds"), 0)
      from "breaks_data"
    ),
    'original_start_time', (
      select "start_time"
      from "session_chain"
      where "chain_position" = 1
    ),
    'chain_length', (
      select count(*)
      from "session_chain"
    )
  ) into "chain_data";
  
  return "chain_data";
end;
$$ language plpgsql stable;

comment on function "public"."get_session_chain_summary"(uuid) is 
  'Returns comprehensive summary of session chain including all sessions, breaks, and totals. Used for approval UI.';

-- =====================================================
-- 6. Comments for Documentation
-- =====================================================

comment on table "public"."workspace_break_types" is 
  'Custom break type definitions per workspace. System types (coffee, lunch, personal, meeting) are created by default.';

comment on table "public"."time_tracking_breaks" is 
  'Individual break records within work sessions. Created when user pauses, completed when resumed. Links to parent session, not the paused session record.';

comment on column "public"."time_tracking_sessions"."was_resumed" is 
  'DEPRECATED: Indicates this session was resumed from a pause. Replaced by parent_session_id chain tracking. Kept for backwards compatibility during migration.';
