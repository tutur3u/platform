-- Meet AI participant self-capture (self_v1), PR 1: additive contracts only.
-- Design: Meet AI notes participant self-capture rev 2 (security-approved
-- design, 30 October 2026). Every existing row and current writer stays
-- `legacy`; no application path creates self_v1 sessions yet, and nothing here
-- dispatches provider work. Read/admission/sharing RPCs: 20261103082007.
-- Indexes that touch existing rows are built concurrently in
-- 20261103082001-20261103082004, the old global chunk sequence key is replaced
-- in 20261103082005, and the NOT VALID constraints below are validated in
-- 20261103082006.
-- Consent: private.meet_ai_consents (#7264) is the only consent source. Stream
-- opens and chunk writes require the participant's CURRENT decision to be
-- `allow` at the exact revision derived from that store; deny/withdraw revoke
-- live streams; nothing (re-admission included) restores a revoked upload
-- grant. The live room (Durable Object) roster is never consent authority.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Sessions: fixed payer, generations, durable sharing and bounded counters.
alter table public.meet_ai_sessions
  add column protocol text not null default 'legacy',
  add column billing_ws_id uuid,
  add column billing_host_id uuid,
  add column generation integer not null default 1,
  add column capture_state text,
  add column capture_deadline_at timestamptz,
  add column cutoff_at timestamptz,
  add column drain_deadline_at timestamptz,
  add column stop_generation integer not null default 0,
  add column erase_generation integer not null default 0,
  add column transcript_revision integer not null default 0,
  add column notes_provider_attempts integer not null default 0,
  add column notes_deliveries integer not null default 0,
  add column notes_redacted_at timestamptz,
  add column share_notes_live boolean not null default false,
  add column share_notes_after boolean not null default false,
  add column share_revision integer not null default 0,
  add column cost_reserved_usd numeric not null default 0,
  add column cost_unknown_usd numeric not null default 0,
  add column cost_settled_usd numeric not null default 0,
  add column cost_cap_usd numeric not null default 20;

-- N2: the host profile FK had no delete action, so a hard profile delete was
-- blocked. A session outlives its host (participants keep own-speech access
-- and admins keep review); a NULL host authorizes nothing and starts no work.
alter table public.meet_ai_sessions alter column user_id drop not null;
alter table public.meet_ai_sessions
  drop constraint meet_ai_sessions_user_id_fkey,
  add constraint meet_ai_sessions_user_id_fkey
    foreign key (user_id) references public.users(id) on delete set null not valid,
  add constraint meet_ai_sessions_billing_ws_id_fkey
    foreign key (billing_ws_id) references public.workspaces(id) on delete cascade not valid,
  add constraint meet_ai_sessions_billing_host_id_fkey
    foreign key (billing_host_id) references public.users(id) on delete set null not valid,
  add constraint meet_ai_sessions_protocol_check
    check (protocol in ('legacy', 'self_v1')) not valid,
  add constraint meet_ai_sessions_capture_state_check
    check (capture_state is null
      or capture_state in ('active', 'draining', 'closed', 'deleted')) not valid,
  add constraint meet_ai_sessions_counters_check
    check (generation >= 1 and stop_generation >= 0 and erase_generation >= 0
      and transcript_revision >= 0 and share_revision >= 0
      and notes_provider_attempts between 0 and 3
      and notes_deliveries between 0 and 6) not valid,
  add constraint meet_ai_sessions_cost_check
    check (cost_reserved_usd >= 0 and cost_unknown_usd >= 0
      and cost_settled_usd >= 0 and cost_cap_usd > 0 and cost_cap_usd <= 20) not valid,
  -- Legacy rows never carry self_v1 authority or sharing.
  add constraint meet_ai_sessions_legacy_check
    check (protocol <> 'legacy' or (billing_ws_id is null and billing_host_id is null
      and capture_state is null and capture_deadline_at is null and cutoff_at is null
      and drain_deadline_at is null and not share_notes_live
      and not share_notes_after)) not valid,
  -- self_v1: finite retention, 3-hour capture, 20-second drain, no
  -- `workspace` visibility, and ended_at only once capture is closed.
  add constraint meet_ai_sessions_self_v1_check
    check (protocol <> 'self_v1' or (billing_ws_id is not null
      and capture_state is not null and capture_deadline_at is not null
      and capture_deadline_at <= created_at + interval '3 hours'
      and purge_after is not null
      and purge_after <= created_at + interval '365 days'
      and visibility in ('host', 'participants')
      and (capture_state in ('active', 'deleted') or cutoff_at is not null)
      and (capture_state <> 'draining' or drain_deadline_at is not null)
      and (drain_deadline_at is null or (cutoff_at is not null
        and drain_deadline_at <= cutoff_at + interval '20 seconds'))
      and (ended_at is null or capture_state in ('closed', 'deleted')))) not valid;

comment on column public.meet_ai_sessions.protocol is
  'legacy (host-uploaded, historical reads only) or self_v1 (each account uploads only its own microphone).';
comment on column public.meet_ai_sessions.billing_host_id is
  'self_v1 fixed payer account; nonauthorizing financial reference. NULL after profile deletion prohibits new work.';
comment on column public.meet_ai_sessions.share_notes_live is
  'self_v1 durable host sharing for admitted participants while the call is live (N5).';
comment on column public.meet_ai_sessions.share_notes_after is
  'self_v1 durable host sharing for admitted participants after the drain deadline (N5).';

create function private.guard_meet_ai_session()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  meeting_ws uuid;
  state_rank constant jsonb :=
    '{"active": 1, "draining": 2, "closed": 3, "deleted": 4}'::jsonb;
begin
  if tg_op = 'INSERT' then
    if new.protocol is distinct from 'self_v1' then return new; end if;
    select m.ws_id into meeting_ws from public.workspace_meetings m
      where m.id = new.meeting_id;
    if new.user_id is null or new.billing_host_id is distinct from new.user_id then
      raise exception 'self_v1 payer must be the session host' using errcode = '23514';
    end if;
    if new.billing_ws_id is distinct from meeting_ws then
      raise exception 'self_v1 payer workspace must own the meeting' using errcode = '23514';
    end if;
    new.capture_state := coalesce(new.capture_state, 'active');
    new.capture_deadline_at :=
      coalesce(new.capture_deadline_at, new.created_at + interval '3 hours');
    if new.capture_state <> 'active' or new.ended_at is not null
       or new.generation <> 1 or new.stop_generation <> 0
       or new.erase_generation <> 0 or new.transcript_revision <> 0
       or new.notes_provider_attempts <> 0 or new.notes_deliveries <> 0
       or new.share_revision <> 0 or new.share_notes_live or new.share_notes_after
       or new.cost_reserved_usd <> 0 or new.cost_unknown_usd <> 0
       or new.cost_settled_usd <> 0 then
      raise exception 'self_v1 sessions start active, unshared and unspent'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.protocol is distinct from old.protocol then
    raise exception 'Meet AI session protocol is immutable' using errcode = '55000';
  end if;
  if old.protocol <> 'self_v1' then return new; end if;
  -- Hosts and payers may only disappear through their profile FK action.
  if new.meeting_id is distinct from old.meeting_id
     or new.created_at is distinct from old.created_at
     or new.billing_ws_id is distinct from old.billing_ws_id
     or new.capture_deadline_at is distinct from old.capture_deadline_at
     or (new.user_id is distinct from old.user_id and new.user_id is not null)
     or (new.billing_host_id is distinct from old.billing_host_id
       and new.billing_host_id is not null) then
    raise exception 'self_v1 session identity and payer are immutable' using errcode = '55000';
  end if;
  if new.purge_after > old.purge_after then
    raise exception 'self_v1 retention deadline cannot be extended' using errcode = '55000';
  end if;
  if new.generation < old.generation or new.stop_generation < old.stop_generation
     or new.erase_generation < old.erase_generation
     or new.transcript_revision < old.transcript_revision
     or new.notes_provider_attempts < old.notes_provider_attempts
     or new.notes_deliveries < old.notes_deliveries
     or new.share_revision < old.share_revision then
    raise exception 'self_v1 generations and budgets never decrease' using errcode = '55000';
  end if;
  if (new.share_notes_live, new.share_notes_after)
       is distinct from (old.share_notes_live, old.share_notes_after)
     and new.share_revision <= old.share_revision then
    raise exception 'self_v1 sharing changes require a new revision' using errcode = '55000';
  end if;
  if (state_rank ->> new.capture_state)::integer
       < (state_rank ->> old.capture_state)::integer then
    raise exception 'self_v1 capture state cannot move backwards' using errcode = '55000';
  end if;
  if old.cutoff_at is not null and new.cutoff_at is distinct from old.cutoff_at then
    raise exception 'self_v1 cutoff is immutable once set' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_session() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_session() to service_role;
create trigger guard_meet_ai_session before insert or update on public.meet_ai_sessions
  for each row execute function private.guard_meet_ai_session();

-- N2 (Pax decision, 3 November 2026): consent records are legal evidence.
-- Deleting a self_v1 session never deletes them: #7264's RESTRICT FK on
-- private.meet_ai_consents.session_id stays as is, exactly as for legacy
-- sessions, so a workspace/meeting/session cascade over consent evidence is
-- refused until the evidence is explicitly erased by its retention owner.

-- Current consent of one account in one session, read from the legal store:
-- the revision is the number of recorded decisions and the decision is the
-- latest one. guard_meet_ai_self_v1_consent keeps self_v1 decisions strictly
-- ordered, so "latest" is unambiguous.
create function private.meet_ai_self_v1_consent_state(p_session_id uuid, p_account_id uuid)
returns table (revision integer, decision text)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select count(*)::integer,
    (array_agg(c.decision order by c.created_at desc, c.id desc))[1]
  from private.meet_ai_consents c
  where c.session_id = p_session_id and c.user_id = p_account_id
    and p_session_id is not null and p_account_id is not null;
$$;
revoke all on function private.meet_ai_self_v1_consent_state(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_consent_state(uuid, uuid) to service_role;

-- Durable actual admission (H3 reader eligibility) and upload grants.
-- Approved-but-never-admitted accounts get no row; device entries cannot add
-- accounts; historical admission is immutable while upload grants revoke.
create table private.meet_ai_session_participants (
  session_id uuid not null references public.meet_ai_sessions(id) on delete cascade,
  account_id uuid not null references public.users(id) on delete cascade,
  first_admitted_at timestamptz not null default now(),
  first_admitted_generation integer not null check (first_admitted_generation >= 1),
  last_admitted_at timestamptz not null default now(),
  last_admitted_generation integer not null,
  upload_revoked_at timestamptz,
  consent_revision integer not null default 0 check (consent_revision >= 0),
  audio_seconds numeric not null default 0 check (audio_seconds between 0 and 10800),
  chunk_count integer not null default 0 check (chunk_count between 0 and 1080),
  primary key (session_id, account_id),
  check (last_admitted_generation >= first_admitted_generation
    and last_admitted_at >= first_admitted_at)
);
create index meet_ai_session_participants_account
  on private.meet_ai_session_participants(account_id);

-- Opaque transport streams. A stream id never authorizes without the
-- composite (session, account) match; one live stream per account.
create table private.meet_ai_capture_streams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  account_id uuid not null references public.users(id) on delete cascade,
  device_epoch integer not null check (device_epoch >= 1),
  input_processing text not null check (input_processing = 'processed_aec'),
  state text not null default 'active'
    check (state in ('active', 'draining', 'closed', 'revoked')),
  lease_expires_at timestamptz not null,
  anchor_id uuid,
  anchor_session_ms bigint check (anchor_session_ms >= 0),
  anchor_sample bigint check (anchor_sample >= 0),
  anchor_uncertainty_ms integer check (anchor_uncertainty_ms between 0 and 500),
  anchor_at timestamptz,
  highest_sequence integer check (highest_sequence between 0 and 1080),
  uploaded_count integer not null default 0 check (uploaded_count between 0 and 1080),
  final_sample bigint check (final_sample >= 0),
  gap_count integer not null default 0 check (gap_count between 0 and 1080),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (id, session_id, account_id),
  foreign key (session_id, account_id)
    references private.meet_ai_session_participants(session_id, account_id)
    on delete cascade,
  check ((state in ('closed', 'revoked')) = (closed_at is not null)),
  check (num_nulls(anchor_id, anchor_session_ms, anchor_sample,
    anchor_uncertainty_ms, anchor_at) in (0, 5))
);
create unique index meet_ai_capture_streams_one_live
  on private.meet_ai_capture_streams(session_id, account_id)
  where state in ('active', 'draining');
create index meet_ai_capture_streams_account
  on private.meet_ai_capture_streams(account_id);

-- Person/session erasure fences. Content-free: counts only, no speech.
create table private.meet_ai_erasure_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  scope text not null check (scope in ('person_session', 'session')),
  session_id uuid references public.meet_ai_sessions(id) on delete set null,
  subject_account_id uuid references public.users(id) on delete set null,
  subject_digest bytea check (octet_length(subject_digest) = 32),
  requested_by text not null check (requested_by in ('subject', 'workspace_admin', 'retention')),
  fence_generation integer not null check (fence_generation >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'handoff')),
  progress_stage text check (length(progress_stage) <= 40),
  progress_cursor uuid,
  counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(counts) = 'object' and octet_length(counts::text) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  check (expires_at <= created_at + interval '365 days'),
  check ((status = 'completed') = (completed_at is not null)),
  check (scope = 'session' or subject_digest is not null),
  check (scope = 'person_session' or (subject_account_id is null and subject_digest is null))
);
create unique index meet_ai_erasure_jobs_one_live
  on private.meet_ai_erasure_jobs(session_id, coalesce(subject_digest, '\x'::bytea))
  where status in ('pending', 'running');
create index meet_ai_erasure_jobs_subject
  on private.meet_ai_erasure_jobs(session_id, subject_account_id);
create index meet_ai_erasure_jobs_account
  on private.meet_ai_erasure_jobs(subject_account_id) where subject_account_id is not null;

-- Account deletion/erase fences (N1): O(1) to install; reads enforce them.
create table private.meet_ai_account_fences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references public.users(id) on delete set null,
  subject_digest bytea unique check (octet_length(subject_digest) = 32),
  reason text not null check (reason in ('account_deletion', 'account_erase')),
  generation integer not null default 1 check (generation >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'handoff')),
  progress_cursor uuid,
  fenced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  check (expires_at <= fenced_at + interval '365 days'),
  check ((status = 'completed') = (completed_at is not null))
);

alter table private.meet_ai_session_participants enable row level security;
alter table private.meet_ai_capture_streams enable row level security;
alter table private.meet_ai_erasure_jobs enable row level security;
alter table private.meet_ai_account_fences enable row level security;
revoke all on private.meet_ai_session_participants, private.meet_ai_capture_streams,
  private.meet_ai_erasure_jobs, private.meet_ai_account_fences
  from public, anon, authenticated;
grant select, insert, update, delete on private.meet_ai_session_participants,
  private.meet_ai_capture_streams, private.meet_ai_erasure_jobs,
  private.meet_ai_account_fences to service_role;

create function private.guard_meet_ai_participant()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  session_protocol text;
begin
  if tg_op = 'INSERT' then
    select s.protocol into session_protocol from public.meet_ai_sessions s
      where s.id = new.session_id for update;
    if session_protocol is distinct from 'self_v1' then
      raise exception 'Admission records require a self_v1 session' using errcode = '23514';
    end if;
    if not exists (select 1 from private.meet_ai_session_participants p
        where p.session_id = new.session_id and p.account_id = new.account_id)
       and (select count(*) from private.meet_ai_session_participants p
         where p.session_id = new.session_id) >= 24 then
      raise exception 'self_v1 session admits at most 24 accounts' using errcode = '54000';
    end if;
    -- Derived, never supplied: decisions recorded before admission count.
    select st.revision into new.consent_revision
      from private.meet_ai_self_v1_consent_state(new.session_id, new.account_id) st;
    return new;
  end if;
  if new.session_id is distinct from old.session_id
     or new.account_id is distinct from old.account_id
     or new.first_admitted_at is distinct from old.first_admitted_at
     or new.first_admitted_generation is distinct from old.first_admitted_generation
     or new.last_admitted_generation < old.last_admitted_generation
     or new.audio_seconds < old.audio_seconds or new.chunk_count < old.chunk_count then
    raise exception 'Historical admission is immutable and budgets never decrease'
      using errcode = '55000';
  end if;
  if old.upload_revoked_at is not null
     and new.upload_revoked_at is distinct from old.upload_revoked_at then
    raise exception 'A revoked upload grant stays revoked' using errcode = '55000';
  end if;
  if new.consent_revision is distinct from old.consent_revision
     and new.consent_revision is distinct from (select st.revision
       from private.meet_ai_self_v1_consent_state(new.session_id, new.account_id) st) then
    raise exception 'Consent revision is derived from private.meet_ai_consents'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_participant() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_participant() to service_role;
create trigger guard_meet_ai_participant before insert or update
  on private.meet_ai_session_participants
  for each row execute function private.guard_meet_ai_participant();

create function private.guard_meet_ai_capture_stream()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.state <> 'active' then
      raise exception 'Capture streams open active' using errcode = '23514';
    end if;
    -- Lock the admission row first (consent decisions update it), then read
    -- the current decision with a fresh snapshot.
    perform 1 from private.meet_ai_session_participants p
      where p.session_id = new.session_id and p.account_id = new.account_id
      for share;
    if not exists (select 1 from private.meet_ai_session_participants p
        join public.meet_ai_sessions s on s.id = p.session_id
        where p.session_id = new.session_id and p.account_id = new.account_id
          and p.upload_revoked_at is null and s.capture_state = 'active') then
      raise exception 'Capture stream needs an active admitted upload grant'
        using errcode = '55000';
    end if;
    if (select st.decision from private.meet_ai_self_v1_consent_state(
        new.session_id, new.account_id) st) is distinct from 'allow' then
      raise exception 'Capture stream needs the participant''s current allow decision'
        using errcode = '55000';
    end if;
    if exists (select 1 from private.meet_ai_capture_streams c
        where c.session_id = new.session_id and c.account_id = new.account_id
          and c.device_epoch >= new.device_epoch) then
      raise exception 'Capture stream epochs must increase' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.session_id is distinct from old.session_id
     or new.account_id is distinct from old.account_id
     or new.device_epoch is distinct from old.device_epoch
     or new.input_processing is distinct from old.input_processing
     or new.created_at is distinct from old.created_at
     or (old.state in ('closed', 'revoked') and new.state is distinct from old.state)
     or (old.state = 'draining' and new.state = 'active')
     or new.uploaded_count < old.uploaded_count or new.gap_count < old.gap_count then
    raise exception 'Capture stream identity is immutable and terminal'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_capture_stream() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_capture_stream() to service_role;
create trigger guard_meet_ai_capture_stream before insert or update
  on private.meet_ai_capture_streams
  for each row execute function private.guard_meet_ai_capture_stream();

-- Chunks: actor-bound self_v1 provenance; legacy rows keep all-NULL columns.
alter table public.meet_ai_chunks
  add column stream_id uuid,
  add column account_id uuid,
  add column source_kind text,
  add column content_digest bytea,
  add column start_ms bigint,
  add column end_ms bigint,
  add column timing_uncertainty_ms integer,
  add column start_sample bigint,
  add column capture_consent_revision integer,
  add column dispatch_consent_revision integer,
  add column erase_generation integer,
  add column transcript_revision integer;
alter table public.meet_ai_chunks
  add constraint meet_ai_chunks_account_id_fkey
    foreign key (account_id) references public.users(id) on delete cascade not valid,
  add constraint meet_ai_chunks_stream_fkey
    foreign key (stream_id, session_id, account_id)
    references private.meet_ai_capture_streams(id, session_id, account_id)
    on delete cascade not valid,
  add constraint meet_ai_chunks_provenance_check
    check ((stream_id is null and num_nonnulls(account_id, source_kind,
        content_digest, start_ms, end_ms, timing_uncertainty_ms, start_sample,
        capture_consent_revision, dispatch_consent_revision, erase_generation,
        transcript_revision) = 0)
      or (stream_id is not null and account_id is not null
        and source_kind = 'microphone' and octet_length(content_digest) = 32
        and start_ms >= 0 and end_ms > start_ms and end_ms - start_ms <= 10000
        and duration_seconds <= 10
        and timing_uncertainty_ms between 0 and 500 and start_sample >= 0
        and capture_consent_revision >= 1
        and (dispatch_consent_revision is null
          or dispatch_consent_revision = capture_consent_revision)
        and erase_generation >= 0 and transcript_revision >= 0)) not valid;

create function private.guard_meet_ai_chunk()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  session_protocol text;
  session_state text;
  revoked_at timestamptz;
  stream_state text;
  consent record;
begin
  if tg_op = 'INSERT' or new.stream_id is distinct from old.stream_id
     or new.session_id is distinct from old.session_id then
    -- KEY SHARE first (the chunk FK takes it anyway): a concurrent consent
    -- decision locks the session before the admission row, so this order
    -- serializes instead of deadlocking.
    select s.protocol, s.capture_state into session_protocol, session_state
      from public.meet_ai_sessions s
      where s.id = new.session_id for key share;
    if (new.stream_id is not null) is distinct from (session_protocol = 'self_v1') then
      raise exception 'Chunk provenance must match its session protocol'
        using errcode = '23514';
    end if;
    if new.stream_id is not null then
      if session_state not in ('active', 'draining') then
        raise exception 'self_v1 chunks are accepted only while capture runs'
          using errcode = '55000';
      end if;
      -- Lock order matches the consent trigger: admission row, then stream.
      -- A missing row is left to the composite stream FK (23503).
      select p.upload_revoked_at into revoked_at
        from private.meet_ai_session_participants p
        where p.session_id = new.session_id and p.account_id = new.account_id
        for share;
      if found then
        if revoked_at is not null then
          raise exception 'self_v1 chunks need an unrevoked upload grant'
            using errcode = '55000';
        end if;
        select c.state into stream_state from private.meet_ai_capture_streams c
          where c.id = new.stream_id and c.session_id = new.session_id
            and c.account_id = new.account_id
          for share;
        if found and stream_state not in ('active', 'draining') then
          raise exception 'self_v1 chunks need a live capture stream'
            using errcode = '55000';
        end if;
        select * into consent
          from private.meet_ai_self_v1_consent_state(new.session_id, new.account_id);
        if consent.decision is distinct from 'allow'
           or new.capture_consent_revision is distinct from consent.revision then
          raise exception 'self_v1 chunks need the participant''s current allow revision'
            using errcode = '55000';
        end if;
      end if;
    end if;
  end if;
  -- Provider dispatch is recorded once, only under the current allow revision.
  if tg_op = 'UPDATE' and old.stream_id is not null
     and new.dispatch_consent_revision is distinct from old.dispatch_consent_revision then
    if old.dispatch_consent_revision is not null then
      raise exception 'self_v1 dispatch revision is immutable once recorded'
        using errcode = '55000';
    end if;
    select * into consent
      from private.meet_ai_self_v1_consent_state(new.session_id, new.account_id);
    if consent.decision is distinct from 'allow'
       or new.dispatch_consent_revision is distinct from consent.revision then
      raise exception 'self_v1 dispatch needs the participant''s current allow revision'
        using errcode = '55000';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.stream_id is not null and (
       new.session_id is distinct from old.session_id
       or new.stream_id is distinct from old.stream_id
       or new.account_id is distinct from old.account_id
       or new.sequence is distinct from old.sequence
       or new.source_kind is distinct from old.source_kind
       or new.content_digest is distinct from old.content_digest
       or new.start_ms is distinct from old.start_ms
       or new.end_ms is distinct from old.end_ms
       or new.start_sample is distinct from old.start_sample
       or new.capture_consent_revision is distinct from old.capture_consent_revision) then
    raise exception 'self_v1 chunk provenance is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_chunk() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_chunk() to service_role;
create trigger guard_meet_ai_chunk before insert or update on public.meet_ai_chunks
  for each row execute function private.guard_meet_ai_chunk();

-- Consent triggers on the legal store (self_v1 sessions only; legacy and
-- guest rows keep #7264 behaviour). Decisions are strictly ordered per
-- account, and evidence cannot be deleted while capture can still run.
create function private.guard_meet_ai_self_v1_consent()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  row_ private.meet_ai_consents := case when tg_op = 'DELETE' then old else new end;
  s public.meet_ai_sessions;
begin
  select * into s from public.meet_ai_sessions where id = row_.session_id;
  if not found or s.protocol <> 'self_v1' or row_.user_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if s.capture_state in ('active', 'draining') then
      raise exception 'self_v1 consent evidence is kept while capture can run'
        using errcode = '55000';
    end if;
    return old;
  end if;
  -- Runs after prepare_meet_ai_consent has locked the session row. A default
  -- transaction-start timestamp becomes the decision's wall-clock time.
  new.created_at := greatest(new.created_at, clock_timestamp());
  if exists (select 1 from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id = new.user_id
        and c.created_at >= new.created_at) then
    raise exception 'self_v1 consent decisions must be recorded in order'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_self_v1_consent() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_self_v1_consent() to service_role;
create trigger sequence_meet_ai_self_v1_consent before insert or delete
  on private.meet_ai_consents
  for each row execute function private.guard_meet_ai_self_v1_consent();

-- Derive participant state from each new decision; deny/withdraw revoke every
-- live stream of that account in the same transaction.
create function private.sync_meet_ai_self_v1_consent()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  consent record;
begin
  if new.user_id is null or not exists (select 1 from public.meet_ai_sessions s
      where s.id = new.session_id and s.protocol = 'self_v1') then
    return null;
  end if;
  select * into consent
    from private.meet_ai_self_v1_consent_state(new.session_id, new.user_id);
  update private.meet_ai_session_participants p
    set consent_revision = consent.revision
    where p.session_id = new.session_id and p.account_id = new.user_id;
  if consent.decision is distinct from 'allow' then
    update private.meet_ai_capture_streams c
      set state = 'revoked', closed_at = now()
      where c.session_id = new.session_id and c.account_id = new.user_id
        and c.state in ('active', 'draining');
  end if;
  return null;
end;
$$;
revoke all on function private.sync_meet_ai_self_v1_consent() from public, anon, authenticated;
grant execute on function private.sync_meet_ai_self_v1_consent() to service_role;
create trigger sync_meet_ai_self_v1_consent after insert on private.meet_ai_consents
  for each row execute function private.sync_meet_ai_self_v1_consent();

-- The legacy reservation RPC is host-owned and globally sequenced. Lock it to
-- legacy sessions and legacy rows so it can never touch self_v1 streams.
create or replace function public.reserve_meet_ai_chunk(
  p_id uuid, p_session_id uuid, p_sequence integer,
  p_start_seconds numeric, p_duration_seconds numeric
) returns public.meet_ai_chunks language plpgsql set search_path = '' as $$
declare
  session public.meet_ai_sessions;
  chunk public.meet_ai_chunks;
begin
  select * into session from public.meet_ai_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if session.protocol <> 'legacy' then
    raise exception 'Legacy reservation cannot reserve self-capture chunks' using errcode = '55000';
  end if;
  select * into chunk from public.meet_ai_chunks
    where session_id = p_session_id and sequence = p_sequence and stream_id is null
    for update;
  if found then
    if chunk.id <> p_id then raise exception 'Chunk identity mismatch'; end if;
    if chunk.status = 'completed' then return null; end if;
    if session.ended_at is not null or session.created_at < now() - interval '3 hours' then
      raise exception 'Session ended';
    end if;
    if chunk.attempts >= 5 or
       (chunk.status = 'processing' and chunk.attempt_started_at > now() - interval '90 seconds') then
      return null;
    end if;
    update public.meet_ai_chunks set
      status = 'processing', attempt_id = gen_random_uuid(), attempt_started_at = now(),
      attempts = attempts + 1,
      unpriced_attempts = unpriced_attempts + case when chunk.cost_usd is null then 1 else 0 end,
      prior_cost_usd = prior_cost_usd + coalesce(chunk.cost_usd, 0),
      transcript = null, usage = null, cost_usd = null
      where id = p_id returning * into chunk;
    return chunk;
  end if;
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

notify pgrst, 'reload schema';
