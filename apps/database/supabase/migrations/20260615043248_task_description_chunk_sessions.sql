create table if not exists private.task_description_chunk_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fields jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists private.task_description_chunks (
  session_id uuid not null references private.task_description_chunk_sessions(id) on delete cascade,
  field text not null check (field in ('description', 'description_yjs_state')),
  chunk_index integer not null check (chunk_index >= 0),
  chunk text not null,
  created_at timestamp with time zone not null default now(),
  primary key (session_id, field, chunk_index)
);

create index if not exists task_description_chunk_sessions_task_user_idx
  on private.task_description_chunk_sessions (task_id, user_id);

create index if not exists task_description_chunk_sessions_created_at_idx
  on private.task_description_chunk_sessions (created_at);

alter table private.task_description_chunk_sessions enable row level security;
alter table private.task_description_chunks enable row level security;

revoke all on table private.task_description_chunk_sessions from anon, authenticated;
revoke all on table private.task_description_chunks from anon, authenticated;

grant all on table private.task_description_chunk_sessions to service_role;
grant all on table private.task_description_chunks to service_role;
