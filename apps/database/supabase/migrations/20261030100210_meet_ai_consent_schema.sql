-- M1-B draft: no audio storage is introduced. NULL retention means forever.
alter table public.meet_ai_sessions
  add column visibility text not null default 'host' check (visibility in ('host', 'participants', 'workspace')),
  add column language_hint text check (language_hint in ('auto', 'vi', 'en', 'vi+en')),
  add column source text not null default 'live' check (source in ('live', 'recording')),
  add column notes_model text,
  add column notes_prompt_version integer,
  add column notes_edited jsonb,
  add column purge_after timestamptz default (now() + interval '365 days');

create table private.meet_ai_consents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meet_ai_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  guest_label text,
  decision text not null check (decision in ('allow', 'deny', 'withdraw')),
  notice_version text not null check (length(notice_version) > 0),
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_label is not null)
);
create index meet_ai_consents_session on private.meet_ai_consents(session_id, created_at);
alter table private.meet_ai_consents enable row level security;
revoke all on private.meet_ai_consents from public, anon, authenticated, service_role;
-- Append-only for service callers; deletion remains available for erasure.
grant select, insert, delete on private.meet_ai_consents to service_role;

create table public.workspace_meet_settings (
  ws_id uuid primary key references public.workspaces(id) on delete cascade,
  transcription_default text not null default 'ask' check (transcription_default in ('off', 'ask', 'automatic')),
  default_language text not null default 'auto' check (default_language in ('auto', 'vi', 'en', 'vi+en')),
  notes_visibility_default text not null default 'participants' check (notes_visibility_default in ('host', 'participants', 'workspace')),
  transcript_retention_days integer default 365 check (transcript_retention_days > 0),
  audio_retention_hours integer not null default 0 check (audio_retention_hours >= 0),
  per_person_opt_in boolean not null default true
);
alter table public.workspace_meet_settings enable row level security;
revoke all on public.workspace_meet_settings from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_meet_settings to authenticated, service_role;
create policy workspace_meet_settings_read on public.workspace_meet_settings
  for select to authenticated using (public.is_org_member(auth.uid(), ws_id));
create policy workspace_meet_settings_admin on public.workspace_meet_settings
  for all to authenticated
  using (public.is_org_member(auth.uid(), ws_id) and public.has_workspace_permission(ws_id, auth.uid(), 'admin'))
  with check (public.is_org_member(auth.uid(), ws_id) and public.has_workspace_permission(ws_id, auth.uid(), 'admin'));
