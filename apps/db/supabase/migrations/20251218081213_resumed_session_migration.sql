-- Migration: Retroactive Data Migration - Convert Legacy was_resumed Sessions to Session Chains
-- Description: Idempotent migration to convert existing was_resumed=true sessions into proper
--              session chains with parent_session_id linkage and time_tracking_breaks records
-- Date: 2025-12-18
-- CRITICAL: Run this AFTER 20251218080209_new_migration.sql

-- =====================================================
-- 1. Create Session Chains from was_resumed Sessions
-- =====================================================

do $$
declare
  "rows_updated" integer := 0;
  "chains_created" integer := 0;
begin
  raise notice 'Starting retroactive session chain migration...';
  
  -- Link resumed sessions to their paused predecessors
  -- Strategy: Find pairs where:
  --   1. Current session has was_resumed=true
  --   2. Previous session by same user in same workspace
  --   3. Previous session ended close to current session start (within 24 hours - generous gap)
  --   4. Sessions don't already have parent_session_id set
  
  with "resumed_session_pairs" as (
    select 
      "current"."id" as "resumed_session_id",
      "previous"."id" as "paused_session_id",
      "current"."ws_id",
      "current"."user_id",
      "current"."start_time" as "resume_time",
      "previous"."end_time" as "pause_time",
      extract(epoch from ("current"."start_time" - "previous"."end_time"))::integer as "break_duration_seconds",
      row_number() over (
        partition by "current"."id" 
        order by "previous"."end_time" desc
      ) as "rn"
    from "public"."time_tracking_sessions" as "current"
    inner join "public"."time_tracking_sessions" as "previous"
      on "previous"."ws_id" = "current"."ws_id"
      and "previous"."user_id" = "current"."user_id"
      and "previous"."end_time" is not null
      and "previous"."end_time" < "current"."start_time"
      and "current"."start_time" - "previous"."end_time" <= interval '24 hours'
    where "current"."was_resumed" = true
      and "current"."parent_session_id" is null
      -- Only link to sessions that aren't already children (avoid creating branches)
      and "previous"."parent_session_id" is null
  ),
  "best_matches" as (
    select 
      "resumed_session_id",
      "paused_session_id",
      "break_duration_seconds"
    from "resumed_session_pairs"
    where "rn" = 1  -- Take the most recent previous session
      and "break_duration_seconds" >= 60  -- At least 1 minute break
      and "break_duration_seconds" <= 86400  -- Max 24 hours (sanity check)
  )
  update "public"."time_tracking_sessions" as "s"
  set "parent_session_id" = "bm"."paused_session_id"
  from "best_matches" as "bm"
  where "s"."id" = "bm"."resumed_session_id";
  
  get diagnostics "rows_updated" = row_count;
  raise notice 'Linked % resumed sessions to their paused predecessors', "rows_updated";
  
  -- Count distinct chains created
  select count(distinct "parent_session_id")
  into "chains_created"
  from "public"."time_tracking_sessions"
  where "parent_session_id" is not null
    and "was_resumed" = true;
  
  raise notice 'Created % session chains', "chains_created";
end $$;

-- =====================================================
-- 2. Create Break Records from Session Gaps
-- =====================================================

do $$
declare
  "breaks_created" integer := 0;
begin
  raise notice 'Creating break records from session gaps...';
  
  -- Create time_tracking_breaks records for gaps between paused and resumed sessions
  -- Link breaks to the PAUSED session (the one before the break), not the resumed one
  
  with "session_gaps" as (
    select 
      "paused"."id" as "session_id",
      "paused"."user_id",
      "paused"."end_time" as "break_start",
      "resumed"."start_time" as "break_end",
      extract(epoch from ("resumed"."start_time" - "paused"."end_time"))::integer as "break_duration_seconds"
    from "public"."time_tracking_sessions" as "resumed"
    inner join "public"."time_tracking_sessions" as "paused"
      on "paused"."id" = "resumed"."parent_session_id"
    where "resumed"."parent_session_id" is not null
      and "paused"."end_time" is not null
      and "resumed"."start_time" > "paused"."end_time"
      -- Don't create duplicate breaks
      and not exists (
        select 1 from "public"."time_tracking_breaks" as "b"
        where "b"."session_id" = "paused"."id"
          and "b"."break_start" = "paused"."end_time"
          and "b"."break_end" = "resumed"."start_time"
      )
  )
  insert into "public"."time_tracking_breaks" (
    "session_id",
    "break_type_id",
    "break_type_name",
    "break_start",
    "break_end",
    "break_duration_seconds",
    "notes",
    "created_by"
  )
  select 
    "sg"."session_id",
    null,  -- No break_type_id for historical data
    'Unspecified',  -- Mark as unspecified for historical breaks
    "sg"."break_start",
    "sg"."break_end",
    "sg"."break_duration_seconds",
    'Retroactively created from legacy session pause',
    "sg"."user_id"
  from "session_gaps" as "sg";
  
  get diagnostics "breaks_created" = row_count;
  raise notice 'Created % break records from session gaps', "breaks_created";
end $$;

-- =====================================================
-- 3. Validation & Reporting
-- =====================================================

do $$
declare
  "total_chains" integer;
  "orphaned_resumed_sessions" integer;
  "sessions_with_breaks" integer;
  "total_breaks" integer;
begin
  raise notice '===========================================';
  raise notice 'Migration Summary';
  raise notice '===========================================';
  
  -- Count total session chains (root sessions with children)
  select count(distinct "parent_session_id")
  into "total_chains"
  from "public"."time_tracking_sessions"
  where "parent_session_id" is not null;
  
  raise notice 'Total session chains created: %', "total_chains";
  
  -- Count orphaned resumed sessions (couldn't find matching predecessor)
  select count(*)
  into "orphaned_resumed_sessions"
  from "public"."time_tracking_sessions"
  where "was_resumed" = true
    and "parent_session_id" is null;
  
  raise notice 'Orphaned resumed sessions (no match found): %', "orphaned_resumed_sessions";
  
  if "orphaned_resumed_sessions" > 0 then
    raise notice '  ^ These sessions have was_resumed=true but no parent_session_id.';
    raise notice '    Possible reasons: gap >24hrs, no matching previous session, or data anomalies.';
  end if;
  
  -- Count sessions with breaks
  select count(distinct "session_id")
  into "sessions_with_breaks"
  from "public"."time_tracking_breaks";
  
  raise notice 'Sessions with break records: %', "sessions_with_breaks";
  
  -- Count total breaks
  select count(*)
  into "total_breaks"
  from "public"."time_tracking_breaks";
  
  raise notice 'Total break records: %', "total_breaks";
  
  raise notice '===========================================';
  raise notice 'Migration completed successfully!';
  raise notice '===========================================';
end $$;

-- =====================================================
-- 4. Create Verification View (Optional - for debugging)
-- =====================================================

create or replace view "public"."v_session_chains_debug" as
with recursive "session_chains" as (
  -- Root sessions (no parent)
  select 
    "s"."id" as "root_id",
    "s"."id",
    "s"."parent_session_id",
    "s"."title",
    "s"."start_time",
    "s"."end_time",
    "s"."duration_seconds",
    "s"."was_resumed",
    1 as "depth",
    "s"."id"::text as "chain_path"
  from "public"."time_tracking_sessions" as "s"
  where "s"."parent_session_id" is null
  
  union all
  
  -- Children (have parent)
  select 
    "sc"."root_id",
    "s"."id",
    "s"."parent_session_id",
    "s"."title",
    "s"."start_time",
    "s"."end_time",
    "s"."duration_seconds",
    "s"."was_resumed",
    "sc"."depth" + 1,
    "sc"."chain_path" || ' -> ' || "s"."id"::text
  from "public"."time_tracking_sessions" as "s"
  inner join "session_chains" as "sc" on "s"."parent_session_id" = "sc"."id"
),
"break_aggregates" as (
  select 
    "session_id",
    count(*) as "break_count",
    sum("break_duration_seconds") as "total_break_seconds"
  from "public"."time_tracking_breaks"
  group by "session_id"
)
select 
  "sc"."root_id",
  "sc"."id" as "session_id",
  "sc"."title",
  "sc"."start_time",
  "sc"."end_time",
  "sc"."duration_seconds",
  "sc"."was_resumed",
  "sc"."depth",
  "sc"."chain_path",
  coalesce("ba"."break_count", 0) as "break_count",
  coalesce("ba"."total_break_seconds", 0) as "total_break_seconds"
from "session_chains" as "sc"
left join "break_aggregates" as "ba" on "ba"."session_id" = "sc"."id"
order by "sc"."root_id", "sc"."depth";

comment on view "public"."v_session_chains_debug" is 
  'Debug view showing all session chains with break counts. Useful for verifying retroactive migration.';

-- Grant select permission to authenticated users on their own data
-- (RLS policies on underlying tables will handle row-level filtering)
grant select on "public"."v_session_chains_debug" to authenticated;
