begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- M1-B: no audio storage is introduced. NULL retention means forever.
alter table public.meet_ai_sessions
  add column visibility text not null default 'host' check (visibility in ('host', 'participants', 'workspace')),
  add column language_hint text check (language_hint in ('auto', 'vi', 'en', 'vi+en')),
  add column source text not null default 'live' check (source in ('live', 'recording')),
  add column notes_model text,
  add column notes_prompt_version integer,
  add column notes_edited jsonb,
  add column purge_after timestamptz;

-- Preserve the reviewed M0 expiry for existing sessions; NULL is forever only
-- when explicitly chosen after this backfill. New sessions default to 365 days.
update public.meet_ai_sessions
  set purge_after = coalesce(ended_at, created_at) + interval '365 days'
  -- Excludes the EC workspace (customer never-write rule; security-approved)
  where not exists (select 1 from public.workspace_meetings ec
    where ec.id = meet_ai_sessions.meeting_id
      and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid);
alter table public.meet_ai_sessions
  alter column purge_after set default (now() + interval '365 days');

create table private.meet_ai_consents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meet_ai_sessions(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  participant_ref uuid not null,
  guest_label text,
  decision text not null check (decision in ('allow', 'deny', 'withdraw')),
  notice_version text not null check (length(notice_version) between 1 and 80),
  created_at timestamptz not null default now(),
  check (user_id is not null or participant_ref is not null)
);
create index meet_ai_consents_session on private.meet_ai_consents(session_id, created_at desc, id desc);
create index meet_ai_consents_user on private.meet_ai_consents(user_id)
  where user_id is not null;
alter table private.meet_ai_consents enable row level security;
revoke all on private.meet_ai_consents from public, anon, authenticated, service_role;
-- Clients have no mutation grants: F7 cannot rewind a withdrawal.
-- Only the trusted server may append evidence or delete it for erasure.
grant select, insert, delete on private.meet_ai_consents to service_role;

-- Mint a random, session-scoped pseudonym only on consent rows. Serializing
-- on the session row makes concurrent first decisions reuse the same UUID.
create function private.prepare_meet_ai_consent()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing_ref uuid;
begin
  perform 1 from public.meet_ai_sessions where id = new.session_id for update;
  if new.user_id is not null then
    -- An account decision must not retain an identifying guest label.
    new.guest_label := null;
    select c.participant_ref into existing_ref from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id = new.user_id
      order by c.created_at, c.id limit 1;
  elsif new.guest_label is not null then
    select c.participant_ref into existing_ref from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id is null
        and c.guest_label = new.guest_label
      order by c.created_at, c.id limit 1;
  else
    -- An anonymous participant can reuse only an already minted session UUID.
    select c.participant_ref into existing_ref from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id is null
        and c.guest_label is null and c.participant_ref = new.participant_ref
      limit 1;
  end if;
  new.participant_ref := coalesce(existing_ref, gen_random_uuid());
  return new;
end;
$$;
revoke all on function private.prepare_meet_ai_consent() from public, anon, authenticated;
grant execute on function private.prepare_meet_ai_consent() to service_role;
create trigger prepare_meet_ai_consent before insert on private.meet_ai_consents
  for each row execute function private.prepare_meet_ai_consent();

-- Immutable even for privileged UPDATE. The sole exception is the FK action
-- during server/Auth account deletion, after its Auth or profile row is gone.
create function private.protect_meet_ai_consent()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_setting('role', true) not in ('anon', 'authenticated')
    and pg_trigger_depth() > 1
    and old.user_id is not null and new.user_id is null
    and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id')
    and (not exists (select 1 from public.users where id = old.user_id)
      or not exists (select 1 from auth.users where id = old.user_id)) then
    return new;
  end if;
  raise exception 'Consent evidence is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.protect_meet_ai_consent() from public, anon, authenticated;
grant execute on function private.protect_meet_ai_consent() to service_role;
create trigger protect_meet_ai_consent before update on private.meet_ai_consents
  for each row execute function private.protect_meet_ai_consent();

-- Auth deletion retains a soft-deleted public profile in this repository.
-- Anonymize evidence at the actual Auth boundary, rather than waiting for a
-- later profile erasure to invoke the SET NULL FK.
create function private.anonymize_meet_ai_consents()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update private.meet_ai_consents set user_id = null where user_id = old.id;
  return old;
end;
$$;
revoke all on function private.anonymize_meet_ai_consents() from public, anon, authenticated;
grant execute on function private.anonymize_meet_ai_consents() to service_role;
create trigger anonymize_meet_ai_consents after delete on auth.users
  for each row execute function private.anonymize_meet_ai_consents();

create table public.workspace_meet_settings (
  ws_id uuid primary key references public.workspaces(id) on delete cascade,
  transcription_default text not null default 'ask' check (transcription_default in ('off', 'ask', 'automatic')),
  default_language text not null default 'auto' check (default_language in ('auto', 'vi', 'en', 'vi+en')),
  notes_visibility_default text not null default 'participants' check (notes_visibility_default in ('host', 'participants', 'workspace')),
  transcript_retention_days integer default 365 check (transcript_retention_days between 1 and 365),
  audio_retention_hours integer not null default 0 check (audio_retention_hours = 0),
  per_person_opt_in boolean not null default true
);
alter table public.workspace_meet_settings enable row level security;
revoke all on public.workspace_meet_settings from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_meet_settings to authenticated, service_role;
create policy account_required_mfa on public.workspace_meet_settings
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));
create policy workspace_meet_settings_read on public.workspace_meet_settings
  for select to authenticated using (public.is_org_member(auth.uid(), ws_id));
create policy workspace_meet_settings_admin on public.workspace_meet_settings
  for all to authenticated
  using (public.is_org_member(auth.uid(), ws_id) and public.has_workspace_permission(ws_id, auth.uid(), 'admin'))
  with check (public.is_org_member(auth.uid(), ws_id) and public.has_workspace_permission(ws_id, auth.uid(), 'admin'));

-- REVIEW REQUIRED (Tess/security): explicitly replaces the M0 retention contract.
-- Stop existing approval: the new predicate requires a fresh dry-run/delete approval.
update private.meet_transcript_purge_control
  set fence_open = false, delete_enabled = false, updated_at = now(),
      updated_by = 'M1-B retention adoption';

drop index public.meet_ai_sessions_transcript_retention_idx;
create index meet_ai_sessions_transcript_retention_idx
  on public.meet_ai_sessions (purge_after, id)
  where transcript_purged_at is null;

create or replace function private.purge_meet_transcripts_batch(
  p_run_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '20s'
set lock_timeout = '2s'
as $$
declare
  control private.meet_transcript_purge_control;
  run private.meet_transcript_purge_runs;
  now_at timestamptz := transaction_timestamp();
  cutoff timestamptz := transaction_timestamp() - interval '365 days';
  remaining integer;
  n_chunks integer := 0;
  n_notes integer := 0;
  n_transcripts integer := 0;
  counts jsonb;
  next_status text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500' using errcode = '22023';
  end if;

  select * into run from private.meet_transcript_purge_runs
    where id = p_run_id for update;
  if not found then
    raise exception 'Unknown purge run' using errcode = 'P0002';
  end if;
  if run.status <> 'running' then
    return jsonb_build_object('state', 'terminal');
  end if;

  -- Holding the fence row until commit makes a concurrent close wait for this
  -- batch and win before the next one.
  select * into control from private.meet_transcript_purge_control
    where id for share;
  if not coalesce(control.fence_open, false)
     or (run.mode = 'delete' and not control.delete_enabled) then
    update private.meet_transcript_purge_runs
      set status = 'stopped', finished_at = now_at where id = p_run_id;
    return jsonb_build_object('state', 'fenced');
  end if;

  if run.batches >= 20 then
    update private.meet_transcript_purge_runs
      set status = 'budget_exhausted', finished_at = now_at where id = p_run_id;
    return jsonb_build_object('state', 'budget_exhausted');
  end if;

  -- Explicit M1-B adoption: dry-run and delete share the same deadline.
  -- NULL means forever. Edited notes expire with the original notes.
  if run.mode = 'dry_run' then
    with due as (
      select s.id, m.ws_id, (s.notes is not null or s.notes_edited is not null) as has_notes
      from public.meet_ai_sessions s
      join public.workspace_meetings m on m.id = s.meeting_id
      where s.transcript_purged_at is null
        and s.purge_after <= now_at
        -- Excludes the EC workspace (customer never-write rule; security-approved)
        and m.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
    ),
    sessions as (
      select d.ws_id, count(*) as sessions,
        count(*) filter (where d.has_notes) as notes,
        coalesce(sum((select count(*) from public.meet_ai_chunks c
          where c.session_id = d.id)), 0) as chunks
      from due d group by d.ws_id
    ),
    transcripts as (
      select m.ws_id, count(*) as recording_transcripts
      from private.recording_transcripts t
      join public.recording_sessions r on r.id = t.session_id
      join public.workspace_meetings m on m.id = r.meeting_id
      where t.created_at <= cutoff
        -- Excludes the EC workspace (customer never-write rule; security-approved)
        and m.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
      group by m.ws_id
    ),
    per_ws as (
      select coalesce(s.ws_id, t.ws_id) as ws_id,
        coalesce(s.chunks, 0)::bigint as chunks,
        coalesce(s.sessions, 0)::bigint as sessions,
        coalesce(s.notes, 0)::bigint as notes,
        coalesce(t.recording_transcripts, 0)::bigint as recording_transcripts
      from sessions s full join transcripts t on t.ws_id = s.ws_id
    )
    select jsonb_build_object(
      'chunks', coalesce(sum(per_ws.chunks), 0),
      'sessions', coalesce(sum(per_ws.sessions), 0),
      'notes', coalesce(sum(per_ws.notes), 0),
      'recording_transcripts', coalesce(sum(per_ws.recording_transcripts), 0),
      'workspaces', count(*),
      'by_workspace', coalesce((
        select jsonb_agg(to_jsonb(top) order by
          top.chunks + top.sessions + top.recording_transcripts desc, top.ws_id)
        from (select * from per_ws p order by
          p.chunks + p.sessions + p.recording_transcripts desc, p.ws_id
          limit 100) top
      ), '[]'::jsonb))
    into counts
    from per_ws;

    update private.meet_transcript_purge_runs
      set dry_run_counts = counts, batches = batches + 1,
        status = 'completed', finished_at = now_at
      where id = p_run_id;
    return jsonb_build_object(
      'state', 'done',
      'chunks', counts -> 'chunks',
      'sessions', counts -> 'sessions',
      'notes', counts -> 'notes',
      'recording_transcripts', counts -> 'recording_transcripts',
      'workspaces', counts -> 'workspaces');
  end if;

  -- Chunk reservations stop three hours after a session starts, so a due
  -- session gains no chunks after it is cleared.
  with doomed as (
    select c.id from public.meet_ai_sessions s
    join public.meet_ai_chunks c on c.session_id = s.id
    where s.transcript_purged_at is null
      and s.purge_after <= now_at
      -- Excludes the EC workspace (customer never-write rule; security-approved)
      and not exists (select 1 from public.workspace_meetings ec
        where ec.id = s.meeting_id and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid)
    order by s.purge_after, s.id, c.sequence
    limit p_limit
    for update of c skip locked
  )
  delete from public.meet_ai_chunks c using doomed where c.id = doomed.id;
  get diagnostics n_chunks = row_count;

  remaining := p_limit - n_chunks;
  if remaining > 0 then
    with cleared as (
      select s.id from public.meet_ai_sessions s
      where s.transcript_purged_at is null
        and s.purge_after <= now_at
        and not exists (select 1 from public.meet_ai_chunks c
                        where c.session_id = s.id)
        -- Excludes the EC workspace (customer never-write rule; security-approved)
        and not exists (select 1 from public.workspace_meetings ec
          where ec.id = s.meeting_id and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid)
      order by s.purge_after, s.id
      limit remaining
      for update of s skip locked
    )
    update public.meet_ai_sessions s
      set notes = null, notes_edited = null, transcript_purged_at = now_at
      from cleared where s.id = cleared.id;
    get diagnostics n_notes = row_count;
  end if;

  remaining := remaining - n_notes;
  if remaining > 0 then
    with doomed as (
      select t.id from private.recording_transcripts t
      where t.created_at <= cutoff
        -- Excludes the EC workspace (customer never-write rule; security-approved)
        and not exists (select 1 from public.recording_sessions r
          join public.workspace_meetings ec on ec.id = r.meeting_id
          where r.id = t.session_id and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid)
      order by t.created_at, t.id
      limit remaining
      for update skip locked
    )
    delete from private.recording_transcripts t using doomed
      where t.id = doomed.id;
    get diagnostics n_transcripts = row_count;
  end if;

  next_status := case
    when n_chunks + n_notes + n_transcripts < p_limit then 'completed'
    when run.batches + 1 >= 20 then 'budget_exhausted'
    else 'running'
  end;
  update private.meet_transcript_purge_runs set
    batches = batches + 1,
    chunks_deleted = chunks_deleted + n_chunks,
    notes_cleared = notes_cleared + n_notes,
    recording_transcripts_deleted = recording_transcripts_deleted + n_transcripts,
    status = next_status,
    finished_at = case when next_status = 'running' then null else now_at end
    where id = p_run_id;

  return jsonb_build_object(
    'state', case next_status when 'running' then 'more'
      when 'completed' then 'done' else next_status end,
    'chunks', n_chunks,
    'notes', n_notes,
    'recording_transcripts', n_transcripts);
end;
$$;

revoke all on function private.purge_meet_transcripts_batch(uuid, integer)
  from public, anon, authenticated;
grant execute on function private.purge_meet_transcripts_batch(uuid, integer)
  to service_role;

commit;
