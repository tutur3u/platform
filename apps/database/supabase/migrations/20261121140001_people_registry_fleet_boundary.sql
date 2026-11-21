-- Narrow Fleet access interfaces for the people registry. The registry definer
-- role holds no Fleet table privileges; it reaches Fleet only through these
-- functions. See apps/docs/platform/features/people-registry.mdx.
begin;

-- tuturuuu: reviewed(function-grant) registry definer only
create function private.fleet_list_user_channel_identities(p_user_id uuid)
returns table (channel text, provider_account_id text, verified_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select i.channel, i.provider_account_id, i.verified_at
  from private.fleet_channel_identities i
  where p_user_id is not null and i.user_id = p_user_id and i.verified_at is not null
  order by i.channel, i.provider_account_id;
$$;
revoke all on function private.fleet_list_user_channel_identities(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_list_user_channel_identities(uuid) to people_registry_definer;

-- One record per provider event carries typed slots. `fleet` and
-- `registry_write` exclude each other, `registry_recall` coexists with either,
-- and one attempt counter covers every slot and redelivery.
alter table private.fleet_provider_events
  add column exclusive_slot text check (exclusive_slot in ('fleet', 'registry_write')),
  add column recall_consumed_at timestamptz,
  add column attempts smallint not null default 1 check (attempts > 0);
update private.fleet_provider_events set exclusive_slot = 'fleet' where exclusive_slot is null;
alter table private.fleet_provider_events add constraint fleet_provider_events_slot_consumed
  check (exclusive_slot is not null or recall_consumed_at is not null);

-- A refusal returns false rather than raising, so the attempt increment
-- commits. Purge resets slots and attempts; replay safety after a purge rests
-- on every ingress refusing provider events older than the 5-minute evidence
-- window, redeliveries included.
-- tuturuuu: no-grant (internal)
create function private.fleet_take_event_slot(p_event jsonb, p_slot text)
returns boolean
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event private.fleet_provider_events;
  v_channel text := p_event ->> 'channel';
  v_account text := p_event ->> 'account';
  v_hash bytea;
begin
  if p_slot is null or p_slot not in ('fleet', 'registry_recall', 'registry_write') then
    raise exception 'Invalid event slot' using errcode = '22023';
  end if;
  if v_channel is null or v_channel not in ('whatsapp', 'zalo', 'discord')
    or v_account is null or v_account !~ '^[!-~]{1,200}$'
    or coalesce(p_event ->> 'eventHash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid provider event' using errcode = '22023';
  end if;
  v_hash := decode(p_event ->> 'eventHash', 'hex');

  -- One retry covers a purge that removes the conflicting row between the
  -- insert and the update. A row that vanishes twice fails closed.
  for v_try in 1..2 loop
    insert into private.fleet_provider_events
      (channel, provider_account_id, event_hash, exclusive_slot, recall_consumed_at)
    values (
      v_channel, v_account, v_hash,
      case when p_slot = 'registry_recall' then null else p_slot end,
      case when p_slot = 'registry_recall' then clock_timestamp() end
    )
    on conflict do nothing;
    if found then
      return true;
    end if;
    update private.fleet_provider_events e set attempts = least(e.attempts + 1, 32767)
    where e.channel = v_channel and e.provider_account_id = v_account and e.event_hash = v_hash
    returning * into v_event;
    exit when found;
  end loop;
  if v_event.event_hash is null or v_event.attempts > 5 then
    return false;
  end if;

  if p_slot = 'registry_recall' then
    update private.fleet_provider_events e set recall_consumed_at = clock_timestamp()
    where e.channel = v_channel and e.provider_account_id = v_account and e.event_hash = v_hash
      and e.recall_consumed_at is null;
  else
    update private.fleet_provider_events e set exclusive_slot = p_slot
    where e.channel = v_channel and e.provider_account_id = v_account and e.event_hash = v_hash
      and e.exclusive_slot is null;
  end if;
  return found;
end;
$$;
revoke all on function private.fleet_take_event_slot(jsonb, text)
  from public, anon, authenticated, service_role;

-- Fleet operations keep their single-use result: true only on first use.
create or replace function private.fleet_consume_provider_event(p_event jsonb)
returns boolean
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  return private.fleet_take_event_slot(p_event, 'fleet');
end;
$$;
revoke all on function private.fleet_consume_provider_event(jsonb)
  from public, anon, authenticated, service_role;

-- tuturuuu: reviewed(function-grant) registry definer only
create function private.fleet_consume_registry_event(p_event jsonb, p_operation text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_operation is null or p_operation not in ('registry.recall', 'registry.write') then
    raise exception 'Only registry operations consume provider events here' using errcode = '22023';
  end if;
  if p_event ->> 'channel' not in ('whatsapp', 'zalo', 'discord')
    or coalesce(p_event ->> 'account', '') !~ '^[!-~]{1,200}$'
    or coalesce(p_event ->> 'eventHash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid provider event' using errcode = '22023';
  end if;
  return private.fleet_take_event_slot(
    p_event, case p_operation when 'registry.recall' then 'registry_recall' else 'registry_write' end
  );
end;
$$;
revoke all on function private.fleet_consume_registry_event(jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_consume_registry_event(jsonb, text) to people_registry_definer;

-- The root workspace's registry owner is the Fleet access Owner.
-- tuturuuu: reviewed(function-grant) registry definer only
create function private.fleet_is_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select c.owner_user_id = p_user_id and public.has_workspace_permission(
      '00000000-0000-0000-0000-000000000000'::uuid, p_user_id, 'manage_mastermind'
    )
    from private.fleet_control c
    where c.singleton
  ), false);
$$;
revoke all on function private.fleet_is_owner(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_is_owner(uuid) to people_registry_definer;

commit;
