-- Product-update email consent: a separate, explicit, default-off opt-in.
--
-- Owner decision (2026-11-23): sign-in agrees to the Terms and Privacy Policy
-- only. Product email is no longer bundled into that acceptance. It is a
-- per-user consent that is false until the user turns it on, is withdrawable
-- at any time, and records who, when, from which surface and under which
-- policy version.
--
-- Shape (see apps/docs/platform/data-protection-standard.mdx):
--   * private.user_product_email_consent        current state, one row per user
--   * private.user_product_email_consent_events append-only audit
--   * private.product_email_recipients          the only view a sender may use
--   * public.set_product_email_consent          write RPC, auth.uid() only
--   * public.get_product_email_consent          read own state
--   * public.list_product_email_consent_events  read own audit
--   * public.should_send_notification           LIVE SEND-BEHAVIOUR CHANGE, see
--                                               the last section of this file
--
-- The tables live in `private` (new application relations do not go in
-- `public`; clients have no table privilege at all). A signed-in user reaches
-- their own rows only through the three caller-bound SECURITY DEFINER RPCs,
-- which run for authenticated and never for anon or PUBLIC.
--
-- Absence of a row means "no consent". Senders must join
-- private.product_email_recipients; nothing else grants permission to send.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.user_product_email_consent (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted boolean not null default false,
  source text not null check (
    source in ('web_onboarding', 'mobile_onboarding', 'web_settings', 'mobile_settings')
  ),
  policy_version text not null check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_product_email_consent_granted_at check (
    not granted or granted_at is not null
  )
);

create table private.user_product_email_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  granted boolean not null,
  source text not null check (
    source in ('web_onboarding', 'mobile_onboarding', 'web_settings', 'mobile_settings')
  ),
  policy_version text not null check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  -- NULL means the user acted for themselves. Reserved for a future audited
  -- staff or support action; the RPC below never sets it.
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index user_product_email_consent_events_user_idx
  on private.user_product_email_consent_events (user_id, created_at desc, id desc);
create index user_product_email_consent_events_actor_idx
  on private.user_product_email_consent_events (actor_id)
  where actor_id is not null;

alter table private.user_product_email_consent enable row level security;
alter table private.user_product_email_consent_events enable row level security;

revoke all on table private.user_product_email_consent
  from public, anon, authenticated, service_role;
revoke all on table private.user_product_email_consent_events
  from public, anon, authenticated, service_role;
revoke all on sequence private.user_product_email_consent_events_id_seq
  from public, anon, authenticated, service_role;

-- Clients have no privilege. The trusted server may only read, to decide
-- whether a send is allowed and to answer an export. Writes go through the
-- RPC; account erasure cascades from public.users.
grant select on table private.user_product_email_consent to service_role;
grant select on table private.user_product_email_consent_events to service_role;

create policy user_product_email_consent_service_read
  on private.user_product_email_consent
  for select to service_role using (true);
create policy user_product_email_consent_events_service_read
  on private.user_product_email_consent_events
  for select to service_role using (true);

-- The audit trail is append-only for client and service roles. Two changes are
-- allowed, both only as the account-erasure cascade (a foreign-key action):
--   * DELETE, once the parent user row is gone;
--   * UPDATE of actor_id to NULL with every other column unchanged, when the
--     acting user row is gone (ON DELETE SET NULL on actor_id).
-- TRUNCATE is always rejected.
create function private.guard_product_email_consent_event_change()
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
  if tg_op = 'UPDATE'
    and pg_trigger_depth() > 1
    and old.actor_id is not null
    and new.actor_id is null
    and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id')
    and not exists (select 1 from public.users u where u.id = old.actor_id) then
    return new;
  end if;
  raise exception 'Product email consent evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.guard_product_email_consent_event_change()
  from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger guard_product_email_consent_event_change
  before update or delete on private.user_product_email_consent_events
  for each row execute function private.guard_product_email_consent_event_change();

create function private.reject_product_email_consent_event_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Product email consent evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_product_email_consent_event_truncate()
  from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger reject_product_email_consent_event_truncate
  before truncate on private.user_product_email_consent_events
  for each statement execute function private.reject_product_email_consent_event_truncate();

-- The sender exclusion rule: only a user whose current state is an explicit
-- grant appears here. Anyone without a row, or who withdrew, is excluded.
create view private.product_email_recipients
  with (security_invoker = true) as
  select c.user_id, c.policy_version, c.source, c.granted_at
  from private.user_product_email_consent c
  where c.granted;

revoke all on table private.product_email_recipients
  from public, anon, authenticated, service_role;
grant select on table private.product_email_recipients to service_role;

create function public.set_product_email_consent(
  p_granted boolean,
  p_source text,
  p_policy_version text
)
returns table (
  granted boolean,
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
  v_uid uuid := auth.uid();
  v_old_granted boolean;
  v_old_version text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_granted is null then
    raise exception 'consent decision is required' using errcode = '22023';
  end if;
  if p_source is null or p_source not in (
    'web_onboarding', 'mobile_onboarding', 'web_settings', 'mobile_settings'
  ) then
    raise exception 'invalid consent source' using errcode = '22023';
  end if;
  if p_policy_version is null
    or p_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' then
    raise exception 'invalid policy version' using errcode = '22023';
  end if;

  -- Serialize one user's decisions so the audit row and state agree.
  perform pg_advisory_xact_lock(
    hashtextextended('private.user_product_email_consent:' || v_uid::text, 0)
  );

  select c.granted, c.policy_version
    into v_old_granted, v_old_version
  from private.user_product_email_consent c
  where c.user_id = v_uid;

  -- A repeat of the identical decision under the same policy version adds no
  -- evidence. A new decision, or the same decision under a new version, does.
  if not found
    or v_old_granted is distinct from p_granted
    or v_old_version is distinct from p_policy_version then
    insert into private.user_product_email_consent_events
      (user_id, granted, source, policy_version, actor_id)
    values (v_uid, p_granted, p_source, p_policy_version, null);

    insert into private.user_product_email_consent as c
      (user_id, granted, source, policy_version, granted_at, withdrawn_at, updated_at)
    values (
      v_uid, p_granted, p_source, p_policy_version,
      case when p_granted then now() end, null, now()
    )
    on conflict (user_id) do update set
      granted = excluded.granted,
      source = excluded.source,
      policy_version = excluded.policy_version,
      granted_at = case when excluded.granted then excluded.granted_at else c.granted_at end,
      -- A re-grant clears the withdrawal time; the audit keeps both events.
      withdrawn_at = case
        when excluded.granted then null
        when c.granted then now()
        else c.withdrawn_at
      end,
      updated_at = excluded.updated_at;
  end if;

  return query
    select c.granted, c.source, c.policy_version, c.granted_at,
      c.withdrawn_at, c.updated_at
    from private.user_product_email_consent c
    where c.user_id = v_uid;
end;
$$;

revoke all on function public.set_product_email_consent(boolean, text, text)
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.set_product_email_consent(boolean,text,text) review=owner-2026-11-23-product-email-consent-caller-bound
grant execute on function public.set_product_email_consent(boolean, text, text)
  to authenticated;

create function public.get_product_email_consent()
returns table (
  granted boolean,
  source text,
  policy_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
    select c.granted, c.source, c.policy_version, c.granted_at,
      c.withdrawn_at, c.updated_at
    from private.user_product_email_consent c
    where c.user_id = v_uid;
  -- No row means the user never decided: report the default, which is off.
  if not found then
    return query
      select false, null::text, null::text, null::timestamptz,
        null::timestamptz, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.get_product_email_consent()
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.get_product_email_consent() review=owner-2026-11-23-product-email-consent-caller-bound
grant execute on function public.get_product_email_consent() to authenticated;

create function public.list_product_email_consent_events(p_limit integer default 50)
returns table (
  granted boolean,
  source text,
  policy_version text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
    select e.granted, e.source, e.policy_version, e.created_at
    from private.user_product_email_consent_events e
    where e.user_id = v_uid
    order by e.created_at desc, e.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.list_product_email_consent_events(integer)
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.list_product_email_consent_events(integer) review=owner-2026-11-23-product-email-consent-caller-bound
grant execute on function public.list_product_email_consent_events(integer)
  to authenticated;

-- LIVE SEND-BEHAVIOUR CHANGE (owner rule, 2026-11-23): the audited consent
-- above is the sole source of truth for marketing email. For the
-- `marketing_communications` event on the `email` channel,
-- should_send_notification now answers true only for a user who appears in
-- private.product_email_recipients (current decision is an explicit grant). A
-- missing row, a withdrawal, and an old notification_preferences row all
-- answer false, so every existing user is off until they opt in. No row is
-- backfilled or rewritten. Every other event type and channel is unchanged:
-- the body below is 20261029050200's, with this one rule added first.
create or replace function public.should_send_notification(
  p_user_id uuid,
  p_event_type text,
  p_channel text,
  p_scope public.notification_scope default 'workspace',
  p_ws_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_preference boolean;
begin
  if p_channel = 'email'
    and p_event_type in ('topic_due_soon', 'topic_late') then
    return false;
  end if;

  if p_channel = 'email' and p_event_type = 'marketing_communications' then
    return exists (
      select 1 from private.product_email_recipients r
      where r.user_id = p_user_id
    );
  end if;

  -- Check for workspace-specific preference first
  if p_scope = 'workspace' and p_ws_id is not null then
    select enabled
      into v_preference
    from public.notification_preferences
    where user_id = p_user_id
      and ws_id = p_ws_id
      and event_type = p_event_type
      and channel = p_channel
      and scope = 'workspace';
  end if;

  -- Fall back to user-level preference if no workspace preference
  if v_preference is null then
    select enabled
      into v_preference
    from public.notification_preferences
    where user_id = p_user_id
      and ws_id is null
      and event_type = p_event_type
      and channel = p_channel
      and scope in ('user', 'system');
  end if;

  -- Default to enabled if no preference found
  return coalesce(v_preference, true);
end;
$$;

revoke all on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid)
  from public, anon, authenticated;
grant execute on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid)
  to service_role;

commit;
