create table "public"."calendar_sync_states" (
  "ws_id" uuid not null references "public"."workspaces"("id") ON DELETE CASCADE,
  "calendar_id" text not null default 'primary',
  "sync_token" text,
  "last_synced_at" timestamp with time zone default now(),
  primary key ("ws_id", "calendar_id")
);

-- Add RLS (Row Level Security) policy
alter table "public"."calendar_sync_states" enable row level security;

-- Create index for better query performance
create index if not exists "calendar_sync_states_ws_id_idx"
  on "public"."calendar_sync_states" ("ws_id");

create index if not exists "calendar_sync_states_calendar_id_idx"
  on "public"."calendar_sync_states" ("calendar_id"); 