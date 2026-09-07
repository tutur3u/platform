-- Audio is processed transiently. Only transcripts, notes and usage are retained.
create table public.meet_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.workspace_meetings(id) on delete cascade,
  user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  notes_status text not null default 'pending' check (notes_status in ('pending', 'processing', 'completed', 'failed')),
  notes jsonb,
  notes_usage jsonb,
  notes_cost_usd numeric,
  notes_started_at timestamptz,
  notes_unpriced_attempts integer not null default 0
);
create unique index meet_ai_one_active_session on public.meet_ai_sessions(meeting_id) where ended_at is null;
create index meet_ai_sessions_meeting on public.meet_ai_sessions(meeting_id, created_at desc);

create table public.meet_ai_chunks (
  id uuid primary key,
  session_id uuid not null references public.meet_ai_sessions(id) on delete cascade,
  sequence integer not null check (sequence between 0 and 1080),
  start_seconds numeric not null check (start_seconds >= 0),
  duration_seconds numeric not null check (duration_seconds > 0 and duration_seconds <= 15),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  transcript text,
  usage jsonb,
  cost_usd numeric,
  created_at timestamptz not null default now(),
  unique(session_id, sequence)
);
create index meet_ai_chunks_session on public.meet_ai_chunks(session_id, sequence);

alter table public.meet_ai_sessions enable row level security;
alter table public.meet_ai_chunks enable row level security;
revoke all on public.meet_ai_sessions, public.meet_ai_chunks from anon, authenticated;
grant select on public.meet_ai_sessions, public.meet_ai_chunks to authenticated;
grant all on public.meet_ai_sessions, public.meet_ai_chunks to service_role;

create policy meet_ai_sessions_read on public.meet_ai_sessions for select to authenticated using (
  exists (select 1 from public.workspace_meetings m join public.workspace_members wm on wm.ws_id = m.ws_id
    where m.id = meeting_id and wm.user_id = auth.uid())
);
create policy meet_ai_chunks_read on public.meet_ai_chunks for select to authenticated using (
  exists (select 1 from public.meet_ai_sessions s where s.id = session_id)
);

-- Serialize chunk reservations with session termination. No provider request may
-- start after finalization has locked and closed the session.
create function public.reserve_meet_ai_chunk(
  p_id uuid, p_session_id uuid, p_sequence integer,
  p_start_seconds numeric, p_duration_seconds numeric
) returns public.meet_ai_chunks language plpgsql set search_path = '' as $$
declare
  session public.meet_ai_sessions;
  chunk public.meet_ai_chunks;
begin
  select * into session from public.meet_ai_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  select * into chunk from public.meet_ai_chunks where session_id = p_session_id and sequence = p_sequence;
  if found then return null; end if;
  if session.ended_at is not null or session.created_at < now() - interval '3 hours' then
    raise exception 'Session ended';
  end if;
  if p_sequence > extract(epoch from (now() - session.created_at)) / 8 + 2 then
    raise exception 'Too many chunks';
  end if;
  insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds)
    values(p_id, p_session_id, p_sequence, p_start_seconds, p_duration_seconds) returning * into chunk;
  return chunk;
end;
$$;
revoke all on function public.reserve_meet_ai_chunk(uuid, uuid, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_meet_ai_chunk(uuid, uuid, integer, numeric, numeric) to service_role;
