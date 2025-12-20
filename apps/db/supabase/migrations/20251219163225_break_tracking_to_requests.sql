-- Migration: Add break tracking to time_tracking_requests
-- Description: Stores break type info with approval request, so break can be
--              created after approval with the newly generated session ID
-- Date: 2024-12-19

-- Add break type columns to time_tracking_requests table
alter table "public"."time_tracking_requests"
  add column if not exists "break_type_id" uuid references "public"."workspace_break_types"("id") on delete set null,
  add column if not exists "break_type_name" text; -- For custom breaks or historical data

-- Create index for querying requests with breaks
create index if not exists "idx_time_tracking_requests_break_type_id" 
  on "public"."time_tracking_requests"("break_type_id");

-- Add comment
comment on column "public"."time_tracking_requests"."break_type_id" is 
  'Break type to create when this request is approved. Linked to workspace_break_types.';

comment on column "public"."time_tracking_requests"."break_type_name" is 
  'Custom break type name when break_type_id is null (denormalized for historical data).';
