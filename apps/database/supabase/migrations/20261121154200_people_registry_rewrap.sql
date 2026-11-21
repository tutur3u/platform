-- Root wrap key rotation for the people registry. A re-wrap job rewrites one
-- workspace key row at a time with a compare-and-swap on the exact old blob,
-- so a concurrent writer or a repeated run never overwrites newer material.
-- The plaintext workspace keys do not change, so hashes and ciphertexts stay
-- valid. A stopped registry refuses re-wraps.
begin;
set local lock_timeout = '3s';

-- Re-wraps run without an actor or principal; their audit events carry the
-- key purpose and kids instead.
alter table private.people_audit_events drop constraint people_audit_events_check;
alter table private.people_audit_events add constraint people_audit_events_writer_check check (
  actor_user_id is not null or principal_id is not null or reason_code like 'refused_%'
  or action like 'key.rewrap.%'
);

-- tuturuuu: reviewed(function-grant) service role; bounded re-wrap job
create function private.people_rewrap_key(
  p_ws uuid, p_purpose private.people_key_purpose, p_version smallint, p_old bytea, p_new bytea
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_stopped boolean;
  v_old_kid text;
begin
  if p_new is null or p_old is null or p_new = p_old or octet_length(p_new) <> 65 or get_byte(p_new, 0) <> 2 then
    raise exception 'Invalid wrapped key' using errcode = '22023';
  end if;
  if octet_length(p_old) = 65 and get_byte(p_old, 0) = 2 then
    v_old_kid := encode(substring(p_old from 2 for 4), 'hex');
    if substring(p_new from 2 for 4) = substring(p_old from 2 for 4) then
      raise exception 'A re-wrap must move to another kid' using errcode = '22023';
    end if;
  else
    v_old_kid := 'legacy';
  end if;
  -- The control row lock serialises the stop flag with this re-wrap.
  select c.stopped into v_stopped from private.people_registry_control c where c.ws_id = p_ws for share;
  if not found then
    return 'missing';
  end if;
  if v_stopped then
    return 'stopped';
  end if;
  update private.people_workspace_keys k set wrapped_key = p_new
  where k.ws_id = p_ws and k.purpose = p_purpose and k.version = p_version and k.wrapped_key = p_old;
  if not found then
    return 'changed';
  end if;
  perform private.people_audit(p_ws, null, null, 'key.rewrap.' || p_purpose::text,
    format('kid_%s_from_%s_v%s', encode(substring(p_new from 2 for 4), 'hex'), v_old_kid, p_version));
  return 'rewrapped';
end;
$$;

-- Rows still wrapped under a kid; a kid is retired only at zero.
-- tuturuuu: reviewed(function-grant) service role; bounded re-wrap job
create function private.people_wrap_kid_usage(p_kid bytea)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select count(*) from private.people_workspace_keys k
  where octet_length(p_kid) = 4 and octet_length(k.wrapped_key) = 65
    and get_byte(k.wrapped_key, 0) = 2 and substring(k.wrapped_key from 2 for 4) = p_kid;
$$;

revoke all on function private.people_rewrap_key(uuid, private.people_key_purpose, smallint, bytea, bytea)
  from public, anon, authenticated, service_role;
grant execute on function private.people_rewrap_key(uuid, private.people_key_purpose, smallint, bytea, bytea) to service_role;
revoke all on function private.people_wrap_kid_usage(bytea) from public, anon, authenticated, service_role;
grant execute on function private.people_wrap_kid_usage(bytea) to service_role;

grant create on schema private to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_rewrap_key(uuid, private.people_key_purpose, smallint, bytea, bytea)
  owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_wrap_kid_usage(bytea) owner to people_registry_definer;
revoke create on schema private from people_registry_definer;

commit;
