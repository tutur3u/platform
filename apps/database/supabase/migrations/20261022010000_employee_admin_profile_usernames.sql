-- Only the managed administrator protocol can mint this exact write capability.
-- Like inventory_invoice_restore_context, it is backend/transaction scoped, not a GUC.
create table private.employee_profile_write_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  actor_id uuid not null,
  user_id uuid not null,
  handle text,
  primary key (backend_pid,transaction_id,user_id)
);
alter table private.employee_profile_write_context enable row level security;
revoke all on private.employee_profile_write_context from public,anon,authenticated,service_role;

create function private.employee_profile_handle_write_allowed(p_user_id uuid,p_handle text)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  select actor_id into actor from private.employee_profile_write_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current()
      and user_id=p_user_id and handle is not distinct from p_handle;
  if not found then return false; end if;
  perform private.assert_employee_administrator(actor);
  return true;
end;
$$;
revoke all on function private.employee_profile_handle_write_allowed(uuid,text)
  from public,anon,authenticated,service_role;

create or replace function public.enforce_public_user_profile_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  last_change timestamptz;
  next_change timestamptz;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot change' USING ERRCODE='22023';
  END IF;
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url AND NEW.avatar_url IS NOT NULL
    AND (length(NEW.avatar_url) > 2000 OR NEW.avatar_url !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Invalid image URL' USING ERRCODE='22023';
  END IF;
  IF NEW.handle IS DISTINCT FROM OLD.handle THEN
    IF NEW.handle IS NOT NULL AND ((case when private.employee_profile_handle_write_allowed(NEW.id,NEW.handle)
      then NEW.handle !~ '^[a-z0-9][a-z0-9_]*$'
      else NEW.handle !~ '^[a-z0-9][a-z0-9_]{4,31}$' end) OR public.is_reserved_username(NEW.handle)) THEN
      RAISE EXCEPTION 'Invalid or reserved username' USING ERRCODE='22023';
    END IF;
    IF NEW.handle IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.handles WHERE value=NEW.handle AND creator_id=NEW.id) THEN
      RAISE EXCEPTION 'Username is unavailable' USING ERRCODE='23505';
    END IF;
    SELECT max(changed_at) INTO last_change FROM private.user_profile_change_events WHERE user_id=NEW.id AND field='handle';
    IF last_change > now()-interval '14 days' THEN
      RAISE EXCEPTION 'Username can be changed every 14 days' USING ERRCODE='PT429', HINT='username_change_cooldown', DETAIL=ceil(extract(epoch FROM last_change+interval '14 days'-now()))::text;
    END IF;
    INSERT INTO private.user_profile_change_events(user_id,field) VALUES(NEW.id,'handle');
  END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF (SELECT count(*) FROM private.user_profile_change_events WHERE user_id=NEW.id AND field='display_name' AND changed_at>now()-interval '7 days') >= 2 THEN
      SELECT min(changed_at)+interval '7 days' INTO next_change FROM private.user_profile_change_events WHERE user_id=NEW.id AND field='display_name' AND changed_at>now()-interval '7 days';
      RAISE EXCEPTION 'Display name can be changed twice every 7 days' USING ERRCODE='PT429', HINT='display_name_change_limit', DETAIL=ceil(extract(epoch FROM next_change-now()))::text;
    END IF;
    INSERT INTO private.user_profile_change_events(user_id,field) VALUES(NEW.id,'display_name');
  END IF;
  DELETE FROM private.user_profile_change_events WHERE user_id=NEW.id AND changed_at<now()-interval '28 days';
  RETURN NEW;
END;
$$;
create function private.enforce_employee_profile_text_limits()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  r record;
  v_value text;
  v_old_value text;
  v_char_limit integer;
  v_byte_limit integer;
  v_effective_char_limit integer;
  v_payload jsonb;
  v_old_payload jsonb;
  v_payload_byte_limit integer;
begin
  if tg_table_name <> 'ai_gateway_models' then
    for r in
      select
        a.attname as column_name,
        case
          when a.atttypid in ('character varying'::regtype, 'bpchar'::regtype)
            and a.atttypmod > 4
          then a.atttypmod - 4
          else null
        end as declared_max_length
      from pg_attribute a
      where a.attrelid = tg_relid
        and a.attnum > 0
        and not a.attisdropped
        and a.atttypid in (
          'text'::regtype,
          'character varying'::regtype,
          'bpchar'::regtype
        )
    loop
      if (tg_table_name = 'calendar_auth_tokens'
          and r.column_name in ('access_token', 'refresh_token'))
        or (tg_table_name = 'ai_chat_messages'
          and r.column_name = 'content')
      then
        continue;
      end if;

      v_value := v_new ->> r.column_name;

      if v_value is null then
        continue;
      end if;

      if tg_op = 'UPDATE' then
        v_old_value := v_old ->> r.column_name;

        if v_old_value is not distinct from v_value then
          continue;
        end if;
      end if;

      if (tg_relid='public.users'::regclass and r.column_name='handle'
          and private.employee_profile_handle_write_allowed((v_new->>'id')::uuid,v_value))
        or (tg_relid='public.handles'::regclass and r.column_name='value'
          and private.employee_profile_handle_write_allowed((v_new->>'creator_id')::uuid,v_value)) then
        continue;
      end if;

      v_char_limit := public.strict_text_field_char_limit(tg_table_name, r.column_name);
      v_byte_limit := public.strict_text_field_byte_limit(tg_table_name, r.column_name);
      v_effective_char_limit := coalesce(
        least(v_char_limit, r.declared_max_length),
        v_char_limit
      );

      if char_length(v_value) > v_effective_char_limit then
        raise exception
          'TEXT_FIELD_LENGTH_EXCEEDED: %.% exceeds % characters',
          tg_table_name,
          r.column_name,
          v_effective_char_limit
          using errcode = '22001';
      end if;

      if octet_length(v_value) > v_byte_limit then
        raise exception
          'TEXT_FIELD_BYTES_EXCEEDED: %.% exceeds % bytes',
          tg_table_name,
          r.column_name,
          v_byte_limit
          using errcode = '22001';
      end if;
    end loop;
  end if;

  for r in
    select a.attname as column_name
    from pg_attribute a
    where a.attrelid = tg_relid
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid in ('json'::regtype, 'jsonb'::regtype)
  loop
    v_payload := v_new -> r.column_name;

    if v_payload is null then
      continue;
    end if;

    if tg_op = 'UPDATE' then
      v_old_payload := v_old -> r.column_name;

      if v_old_payload is not distinct from v_payload then
        continue;
      end if;
    end if;

    v_payload_byte_limit := public.strict_payload_field_byte_limit(
      tg_table_name,
      r.column_name
    );

    if octet_length(v_payload::text) > v_payload_byte_limit then
      raise exception
        'PAYLOAD_FIELD_BYTES_EXCEEDED: %.% exceeds % bytes',
        tg_table_name,
        r.column_name,
        v_payload_byte_limit
        using errcode = '22001';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.enforce_employee_profile_text_limits() from public,anon,authenticated,service_role;
-- These two tables retain every generic check in the trigger, with one exact
-- protected-field exception. Other tables keep the original trigger function.
drop trigger enforce_strict_text_field_limits on public.users;
create trigger enforce_strict_text_field_limits before insert or update on public.users
for each row execute function private.enforce_employee_profile_text_limits();
drop trigger enforce_strict_text_field_limits on public.handles;
create trigger enforce_strict_text_field_limits before insert or update on public.handles
for each row execute function private.enforce_employee_profile_text_limits();
-- Unconditional CHECKs cannot represent a transaction-scoped administrator
-- exception. The triggers above still enforce the original limits outside it.
alter table public.users drop constraint handle_strict_length_check;
alter table public.users drop constraint handle_strict_bytes_check;
alter table public.handles drop constraint value_strict_length_check;
alter table public.handles drop constraint value_strict_bytes_check;

create or replace function private.update_employee_profile(p_actor_id uuid,p_user_id uuid,p_email text,
  p_expected_revision bigint,p_operation_id uuid,p_name text,p_handle text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  observed jsonb;
  receipt private.employee_profile_renames%rowtype;
  creation private.employee_creation_operations%rowtype;
  mailbox_id uuid;
  affected integer;
  reserved_owner uuid;
begin
  observed:=private.inspect_employee_profile(p_actor_id,p_user_id,p_email);
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision>=9007199254740991 or p_name is null or p_name<>btrim(p_name)
    or length(p_name) not between 1 and 100 then
    raise exception using errcode='22023',message='Invalid employee profile request';
  end if;
  select * into receipt from private.employee_profile_renames where operation_id=p_operation_id;
  if found then
    if receipt.actor_id<>p_actor_id or receipt.user_id<>p_user_id or receipt.staff_email<>p_email
      or receipt.before_revision<>p_expected_revision or receipt.after_name<>p_name
      or receipt.after_handle is distinct from p_handle then
      raise exception using errcode='23505',message='Employee profile operation payload conflict';
    end if;
    return private.employee_profile_receipt(receipt);
  end if;
  if observed->'managed' is distinct from 'true'::jsonb or observed->'ready' is distinct from 'true'::jsonb
    or (observed->>'revision')::bigint<>p_expected_revision then
    raise exception using errcode='23514',message='Employee profile preimage conflict';
  end if;
  select * into creation from private.employee_creation_operations where target_id=p_user_id;
  if not private.employee_profile_lineage(p_user_id,p_email,observed->>'displayName',p_expected_revision,
    creation.actor_id,creation.operation_id) then
    raise exception using errcode='23514',message='Employee profile lineage conflict';
  end if;
  select e.mailbox_id into mailbox_id from private.infrastructure_employees e where user_id=p_user_id;
  perform private.assert_employee_administrator(p_actor_id);
  update private.infrastructure_employees set managed_name=p_name,revision=revision+1,
    updated_by=p_actor_id,updated_at=now() where user_id=p_user_id and revision=p_expected_revision;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Employee profile revision conflict'; end if;
  if p_handle is distinct from observed->>'username' and p_handle is not null
    and (p_handle !~ '^[a-z0-9][a-z0-9_]*$' or public.is_reserved_username(p_handle)) then
    raise exception using errcode='22023',message='Invalid username';
  end if;
  insert into private.employee_profile_write_context(backend_pid,transaction_id,actor_id,user_id,handle)
    values(pg_backend_pid(),txid_current(),p_actor_id,p_user_id,p_handle);
  if p_handle is not null and p_handle is distinct from observed->>'username' then
    insert into public.handles(value,creator_id) values(p_handle,p_user_id) on conflict do nothing;
    select creator_id into reserved_owner from public.handles where value=p_handle for update;
    if reserved_owner is distinct from p_user_id then
      raise exception using errcode='23505',message='Username is unavailable';
    end if;
  end if;
  update public.users set display_name=p_name,handle=p_handle where id=p_user_id;
  delete from private.employee_profile_write_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current() and user_id=p_user_id;
  update public.user_private_details set full_name=p_name where user_id=p_user_id and email=p_email;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Employee private profile conflict'; end if;
  update private.mail_mailboxes set display_name=p_name,sender_name=p_name where id=mailbox_id and address=p_email;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Employee mailbox conflict'; end if;
  insert into private.employee_profile_renames(operation_id,actor_id,user_id,staff_email,
    before_revision,after_revision,before_name,after_name,before_handle,after_handle,creation_actor_id,creation_operation_id)
    values(p_operation_id,p_actor_id,p_user_id,p_email,p_expected_revision,p_expected_revision+1,
      observed->>'displayName',p_name,observed->>'username',p_handle,creation.actor_id,creation.operation_id)
    returning * into receipt;
  observed:=private.inspect_employee_profile(p_actor_id,p_user_id,p_email);
  if observed->'ready' is distinct from 'true'::jsonb or observed->>'displayName' is distinct from p_name
    or observed->>'username' is distinct from p_handle
    or (observed->>'revision')::bigint<>p_expected_revision+1 then
    raise exception using errcode='23514',message='Employee profile postimage conflict';
  end if;
  return private.employee_profile_receipt(receipt);
end;
$$;
