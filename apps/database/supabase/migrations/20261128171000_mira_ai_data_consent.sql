-- Mira AI data consent (Apple 5.1.2(i)): a per-user, server-side record that
-- the person allowed Mira to send their content (text, files, voice, camera,
-- screen) to the third-party model provider, Google Gemini.
--
-- Shape:
--   * private.user_ai_data_consent         current decision per user
--   * private.user_ai_data_consent_events  append-only audit
--   * private.record_ai_data_consent        write, service_role only (Web API)
--   * private.get_ai_data_consent           read one user's decision
--   * private.has_ai_data_consent           the Mira gate (default: false)
--
-- Default is no consent: a person who never answered is treated as "not now".
-- Decision and scope: apps/docs/platform/chat-safety-and-ai-consent.mdx.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table private.user_ai_data_consent (
  user_id uuid primary key references public.users(id) on delete cascade,
  provider text not null default 'google_gemini' check (provider = 'google_gemini'),
  granted boolean not null default false,
  source text not null check (
    source in ('mobile_mira_prompt', 'mobile_settings', 'web_mira_prompt', 'web_settings')
  ),
  policy_version text not null check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_ai_data_consent_granted_at check (
    not granted or granted_at is not null
  )
);

create table private.user_ai_data_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider = 'google_gemini'),
  granted boolean not null,
  source text not null check (
    source in ('mobile_mira_prompt', 'mobile_settings', 'web_mira_prompt', 'web_settings')
  ),
  policy_version text not null check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  created_at timestamptz not null default now()
);

create index user_ai_data_consent_events_user_idx
  on private.user_ai_data_consent_events (user_id, created_at desc, id desc);

alter table private.user_ai_data_consent enable row level security;
alter table private.user_ai_data_consent_events enable row level security;

revoke all on table private.user_ai_data_consent
  from public, anon, authenticated, service_role;
revoke all on table private.user_ai_data_consent_events
  from public, anon, authenticated, service_role;
revoke all on sequence private.user_ai_data_consent_events_id_seq
  from public, anon, authenticated, service_role;

grant select on table private.user_ai_data_consent to service_role;
grant select on table private.user_ai_data_consent_events to service_role;

create policy user_ai_data_consent_service_read
  on private.user_ai_data_consent
  for select to service_role using (true);
create policy user_ai_data_consent_events_service_read
  on private.user_ai_data_consent_events
  for select to service_role using (true);

-- Append-only evidence; only the account-erasure cascade may delete rows.
create function private.guard_ai_data_consent_event_change()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE'
    and pg_trigger_depth() > 1
    and not exists (select 1 from public.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'AI data consent evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.guard_ai_data_consent_event_change()
  from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger guard_ai_data_consent_event_change
  before update or delete on private.user_ai_data_consent_events
  for each row execute function private.guard_ai_data_consent_event_change();

create function private.reject_ai_data_consent_event_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'AI data consent evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_ai_data_consent_event_truncate()
  from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger reject_ai_data_consent_event_truncate
  before truncate on private.user_ai_data_consent_events
  for each statement execute function private.reject_ai_data_consent_event_truncate();

create function private.record_ai_data_consent(
  p_user_id uuid,
  p_granted boolean,
  p_source text,
  p_policy_version text
)
returns table (
  granted boolean,
  provider text,
  source text,
  policy_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := p_user_id;
  v_old_granted boolean;
  v_old_version text;
begin
  if v_uid is null then
    raise exception 'user is required' using errcode = '22023';
  end if;
  if p_granted is null then
    raise exception 'consent decision is required' using errcode = '22023';
  end if;
  if p_source is null or p_source not in (
    'mobile_mira_prompt', 'mobile_settings', 'web_mira_prompt', 'web_settings'
  ) then
    raise exception 'invalid consent source' using errcode = '22023';
  end if;
  if p_policy_version is null
    or p_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' then
    raise exception 'invalid policy version' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('private.user_ai_data_consent:' || v_uid::text, 0)
  );

  select c.granted, c.policy_version
    into v_old_granted, v_old_version
  from private.user_ai_data_consent c
  where c.user_id = v_uid;

  if not found
    or v_old_granted is distinct from p_granted
    or v_old_version is distinct from p_policy_version then
    insert into private.user_ai_data_consent_events
      (user_id, provider, granted, source, policy_version)
    values (v_uid, 'google_gemini', p_granted, p_source, p_policy_version);

    insert into private.user_ai_data_consent as c
      (user_id, provider, granted, source, policy_version, granted_at, withdrawn_at, updated_at)
    values (
      v_uid, 'google_gemini', p_granted, p_source, p_policy_version,
      case when p_granted then now() end, null, now()
    )
    on conflict (user_id) do update set
      granted = excluded.granted,
      source = excluded.source,
      policy_version = excluded.policy_version,
      granted_at = case when excluded.granted then excluded.granted_at else c.granted_at end,
      withdrawn_at = case
        when excluded.granted then null
        when c.granted then now()
        else c.withdrawn_at
      end,
      updated_at = excluded.updated_at;
  end if;

  return query
    select c.granted, c.provider, c.source, c.policy_version, c.granted_at,
      c.withdrawn_at, c.updated_at
    from private.user_ai_data_consent c
    where c.user_id = v_uid;
end;
$$;

revoke all on function private.record_ai_data_consent(uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.record_ai_data_consent(uuid, boolean, text, text)
  to service_role;

create function private.get_ai_data_consent(
  p_user_id uuid
)
returns table (
  granted boolean,
  provider text,
  policy_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select c.granted, c.provider, c.policy_version, c.granted_at, c.withdrawn_at
  from private.user_ai_data_consent c
  where c.user_id = p_user_id;
$$;

revoke all on function private.get_ai_data_consent(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.get_ai_data_consent(uuid) to service_role;

create function private.has_ai_data_consent(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select c.granted
    from private.user_ai_data_consent c
    where c.user_id = p_user_id
  ), false);
$$;

revoke all on function private.has_ai_data_consent(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.has_ai_data_consent(uuid) to service_role;

commit;
