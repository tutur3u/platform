begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.finance_bill_split_status_links (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null,
  split_id uuid not null,
  participant_id uuid,
  receiving_participant_id uuid,
  receiving_consent_revision uuid,
  public_name text check (
    public_name is null or (length(btrim(public_name)) between 1 and 80 and participant_id is not null)
  ),
  digest text not null unique check (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (ws_id, split_id)
    references private.finance_bill_splits(ws_id, id) on delete cascade,
  foreign key (ws_id, split_id, participant_id)
    references private.finance_bill_split_participants(ws_id, split_id, id),
  foreign key (ws_id, split_id, receiving_participant_id)
    references private.finance_bill_split_participants(ws_id, split_id, id),
  check ((receiving_participant_id is null) = (receiving_consent_revision is null)),
  check (expires_at > created_at and expires_at <= created_at + interval '168 hours'),
  check (revoked_at is null or revoked_at >= created_at)
);

create index finance_bill_split_status_links_split
  on private.finance_bill_split_status_links(ws_id, split_id, participant_id);

create index finance_bill_split_status_links_receiving_consent
  on private.finance_bill_split_status_links(ws_id, receiving_consent_revision)
  where receiving_consent_revision is not null and revoked_at is null;

alter table private.finance_bill_split_status_links enable row level security;
revoke all on table private.finance_bill_split_status_links from public, anon, authenticated, service_role;
grant select, insert on table private.finance_bill_split_status_links to service_role;
grant update (revoked_at) on table private.finance_bill_split_status_links to service_role;

create function private.manage_finance_bill_split_link(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid,
  p_digest text default null,
  p_hours integer default null,
  p_participant_id uuid default null,
  p_public_name text default null,
  p_revoke_id uuid default null,
  p_receiving_participant_id uuid default null,
  p_expected_consent_revision uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  link_id uuid;
  receiving_contact uuid;
  consent_revision uuid;
begin
  if not exists (
    select 1
    from private.finance_bill_splits as split
    join public.workspace_members as membership
      on membership.ws_id = split.ws_id and membership.user_id = p_actor_id
    where split.ws_id = p_ws_id and split.id = p_split_id
      and split.created_by = p_actor_id and membership.type = 'MEMBER'
  ) then
    raise insufficient_privilege using message = 'Split owner access required';
  end if;

  if p_revoke_id is not null then
    update private.finance_bill_split_status_links
    set revoked_at = coalesce(revoked_at, now())
    where id = p_revoke_id and ws_id = p_ws_id and split_id = p_split_id
    returning id into link_id;
    return link_id;
  end if;

  if p_hours is null or p_hours not between 1 and 168 or p_digest is null then
    raise invalid_parameter_value using message = 'Invalid link expiry or token';
  end if;

  if not coalesce((
    select revision.finalized
    from private.finance_bill_split_revisions as revision
    where revision.ws_id = p_ws_id and revision.split_id = p_split_id
    order by revision.revision desc
    limit 1
  ), false) then
    raise sqlstate 'PT409' using message = 'Sharing requires a finalized split';
  end if;

  if (p_receiving_participant_id is null) <> (p_expected_consent_revision is null) then
    raise invalid_parameter_value using message = 'Receiving QR requires an account revision';
  end if;
  if p_receiving_participant_id is not null then
    select participant.contact_id into receiving_contact
    from private.finance_bill_split_participants as participant
    where participant.ws_id = p_ws_id and participant.split_id = p_split_id
      and participant.id = p_receiving_participant_id;

    if receiving_contact is not null then
      consent_revision := (private.finance_contact_bank_command(
        p_ws_id, p_actor_id, receiving_contact, 'share_account'
      )->>'consentRevision')::uuid;
    end if;
    if consent_revision is null then
      raise insufficient_privilege using message = 'Only the verified holder can share an active receiving account';
    end if;
    if consent_revision <> p_expected_consent_revision then
      raise sqlstate 'PT409' using message = 'Receiving account changed; select it again';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bill-split-link/' || p_ws_id::text || '/' || p_split_id::text, 0));
  if (
    select count(*)
    from private.finance_bill_split_status_links as active
    where active.ws_id = p_ws_id and active.split_id = p_split_id
      and active.revoked_at is null and active.expires_at > now()
  ) >= 20 then
    raise sqlstate 'PT409' using message = 'Too many active status links';
  end if;

  insert into private.finance_bill_split_status_links (
    ws_id, split_id, participant_id, receiving_participant_id, receiving_consent_revision, public_name, digest, expires_at
  ) values (
    p_ws_id, p_split_id, p_participant_id, p_receiving_participant_id, consent_revision, p_public_name, p_digest, now() + make_interval(hours => p_hours)
  ) returning id into link_id;
  return link_id;
end;
$$;

revoke all on function private.manage_finance_bill_split_link(uuid, uuid, uuid, text, integer, uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.manage_finance_bill_split_link(uuid, uuid, uuid, text, integer, uuid, text, uuid, uuid, uuid)
  to service_role;

create function private.lookup_finance_bill_split_link(p_digest text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'wsId', link.ws_id,
    'splitId', link.split_id,
    'creatorId', split.created_by,
    'participantId', link.participant_id,
    'publicName', link.public_name,
    'receivingParticipantId', receiver.id,
    'receivingContactId', receiver.contact_id,
    'receivingConsentRevision', link.receiving_consent_revision
  )
  from private.finance_bill_split_status_links as link
  join private.finance_bill_splits as split
    on split.ws_id = link.ws_id and split.id = link.split_id
  join public.workspace_members as membership
    on membership.ws_id = split.ws_id and membership.user_id = split.created_by
  left join private.finance_bill_split_participants as receiver
    on receiver.ws_id = link.ws_id and receiver.split_id = link.split_id
    and receiver.id = link.receiving_participant_id
  where link.digest = p_digest and link.revoked_at is null and link.expires_at > now()
    and membership.type = 'MEMBER';
$$;

revoke all on function private.lookup_finance_bill_split_link(text)
  from public, anon, authenticated;
grant execute on function private.lookup_finance_bill_split_link(text)
  to service_role;

create function private.list_finance_bill_split_links(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', active.id, 'expiresAt', active.expires_at, 'participantId', active.participant_id
  ) order by active.expires_at, active.id), '[]'::jsonb)
  from private.finance_bill_split_status_links as active
  join private.finance_bill_splits as split
    on split.ws_id = active.ws_id and split.id = active.split_id
  join public.workspace_members as membership
    on membership.ws_id = split.ws_id and membership.user_id = p_actor_id
  where active.ws_id = p_ws_id and active.split_id = p_split_id
    and split.created_by = p_actor_id and membership.type = 'MEMBER'
    and active.revoked_at is null and active.expires_at > now();
$$;

revoke all on function private.list_finance_bill_split_links(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.list_finance_bill_split_links(uuid, uuid, uuid)
  to service_role;

commit;
