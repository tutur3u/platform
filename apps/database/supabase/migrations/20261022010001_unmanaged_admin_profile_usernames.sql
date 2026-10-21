-- Legacy Infrastructure profiles use their own atomic receipt, never employee
-- registry/name/provenance mutation or a caller-controlled policy flag.
create table private.unmanaged_internal_profile_operations (
  operation_id uuid primary key,
  actor_id uuid not null references public.users(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  email text not null,
  expected_name text,
  expected_handle text,
  after_name text not null check(after_name=btrim(after_name) and length(after_name) between 1 and 100),
  after_handle text,
  created_at timestamptz not null default clock_timestamp()
);
alter table private.unmanaged_internal_profile_operations enable row level security;
revoke all on private.unmanaged_internal_profile_operations from public,anon,authenticated,service_role;
create trigger unmanaged_internal_profile_operations_append_only
before update or delete on private.unmanaged_internal_profile_operations
for each row execute function private.reject_employee_profile_receipt_change();

create function private.unmanaged_internal_profile_receipt(p private.unmanaged_internal_profile_operations)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('operationId',p.operation_id,'actorUserId',p.actor_id,
    'id',p.user_id,'email',p.email,'expectedDisplayName',p.expected_name,
    'expectedUsername',p.expected_handle,'displayName',p.after_name,'username',p.after_handle);
$$;
revoke all on function private.unmanaged_internal_profile_receipt(private.unmanaged_internal_profile_operations)
  from public,anon,authenticated,service_role;

-- Both entrypoints repeat this admission in their own PostgREST transaction.
-- No target confirmation/ban requirement: existing legacy eligibility is retained.
create function private.lock_unmanaged_internal_profile(p_actor_id uuid,p_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target auth.users%rowtype; profile public.users%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Internal profile requires read committed';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('employee-address-reservations',0));
  perform private.lock_employee_auth_pair(p_actor_id,p_user_id);
  perform private.assert_employee_administrator(p_actor_id);
  select * into target from auth.users where id=p_user_id;
  if target.id is null or p_email is null or p_email<>lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@tuturuuu[.]com$' or target.email is distinct from p_email then
    raise exception using errcode='23514',message='Unmanaged internal profile identity conflict';
  end if;
  if target.raw_app_meta_data ? 'employee_onboarding'
    or exists(select 1 from private.infrastructure_employees where user_id=p_user_id or staff_email=p_email)
    or exists(select 1 from private.employee_creation_intents where user_id=p_user_id or staff_email=p_email)
    or exists(select 1 from private.employee_creation_operations where target_id=p_user_id or staff_email=p_email)
    or exists(select 1 from private.employee_restore_operations where user_id=p_user_id or staff_email=p_email)
    or exists(select 1 from private.employee_address_migrations
      where user_id=p_user_id or source_address=p_email or destination_address=p_email)
    or exists(select 1 from private.employee_profile_renames where user_id=p_user_id or staff_email=p_email) then
    raise exception using errcode='23514',message='Managed account requires employee profile protocol';
  end if;
  select * into profile from public.users where id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='Profile not found'; end if;
  if profile.handle is not null and not exists(select 1 from public.handles
    where value=profile.handle and creator_id=p_user_id) then
    raise exception using errcode='23505',message='Username is unavailable';
  end if;
  return jsonb_build_object('managed',false,'id',p_user_id,'email',p_email,
    'displayName',profile.display_name,'username',profile.handle);
end;
$$;
revoke all on function private.lock_unmanaged_internal_profile(uuid,uuid,text)
  from public,anon,authenticated,service_role;

create function private.update_unmanaged_internal_profile(p_actor_id uuid,p_user_id uuid,p_email text,
  p_operation_id uuid,p_expected_name text,p_expected_handle text,p_name text,p_handle text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  observed jsonb;
  receipt private.unmanaged_internal_profile_operations%rowtype;
  reserved_owner uuid;
  affected integer;
begin
  observed:=private.lock_unmanaged_internal_profile(p_actor_id,p_user_id,p_email);
  if p_operation_id is null or p_name is null or p_name<>btrim(p_name)
    or length(p_name) not between 1 and 100 then
    raise exception using errcode='22023',message='Invalid internal profile request';
  end if;
  select * into receipt from private.unmanaged_internal_profile_operations where operation_id=p_operation_id;
  if found then
    if receipt.actor_id<>p_actor_id or receipt.user_id<>p_user_id or receipt.email<>p_email
      or receipt.expected_name is distinct from p_expected_name
      or receipt.expected_handle is distinct from p_expected_handle
      or receipt.after_name<>p_name or receipt.after_handle is distinct from p_handle then
      raise exception using errcode='23505',message='Internal profile operation payload conflict';
    end if;
    return private.unmanaged_internal_profile_receipt(receipt);
  end if;
  if observed->>'displayName' is distinct from p_expected_name
    or observed->>'username' is distinct from p_expected_handle then
    raise exception using errcode='23514',message='Internal profile preimage conflict';
  end if;
  if p_handle is distinct from p_expected_handle and p_handle is not null
    and (p_handle !~ '^[a-z0-9][a-z0-9_]*$' or public.is_reserved_username(p_handle)) then
    raise exception using errcode='22023',message='Invalid username';
  end if;
  -- Lock existing old/new reservations in value order before claiming a missing
  -- value. The unique index arbitrates concurrent claims of an absent handle.
  perform 1 from public.handles where value in(p_expected_handle,p_handle) order by value for update;
  if p_expected_handle is not null and not exists(select 1 from public.handles
    where value=p_expected_handle and creator_id=p_user_id) then
    raise exception using errcode='23505',message='Username is unavailable';
  end if;
  perform private.assert_employee_administrator(p_actor_id);
  insert into private.employee_profile_write_context(backend_pid,transaction_id,actor_id,user_id,handle)
    values(pg_backend_pid(),txid_current(),p_actor_id,p_user_id,p_handle);
  if p_handle is not null and p_handle is distinct from p_expected_handle then
    insert into public.handles(value,creator_id) values(p_handle,p_user_id) on conflict do nothing;
    select creator_id into reserved_owner from public.handles where value=p_handle for update;
    if reserved_owner is distinct from p_user_id then
      raise exception using errcode='23505',message='Username is unavailable';
    end if;
  end if;
  update public.users set display_name=p_name,handle=p_handle where id=p_user_id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Internal profile write conflict'; end if;
  delete from private.employee_profile_write_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current() and user_id=p_user_id;
  if p_expected_handle is not null and p_expected_handle is distinct from p_handle then
    delete from public.handles where value=p_expected_handle and creator_id=p_user_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception using errcode='23514',message='Internal profile release conflict'; end if;
  end if;
  insert into private.unmanaged_internal_profile_operations(operation_id,actor_id,user_id,email,
    expected_name,expected_handle,after_name,after_handle)
    values(p_operation_id,p_actor_id,p_user_id,p_email,p_expected_name,p_expected_handle,p_name,p_handle)
    returning * into receipt;
  observed:=private.lock_unmanaged_internal_profile(p_actor_id,p_user_id,p_email);
  if observed->>'displayName' is distinct from p_name or observed->>'username' is distinct from p_handle then
    raise exception using errcode='23514',message='Internal profile postimage conflict';
  end if;
  return private.unmanaged_internal_profile_receipt(receipt);
end;
$$;

create function private.inspect_unmanaged_internal_profile_operation(p_actor_id uuid,p_user_id uuid,p_email text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare observed jsonb; receipt private.unmanaged_internal_profile_operations%rowtype;
begin
  observed:=private.lock_unmanaged_internal_profile(p_actor_id,p_user_id,p_email);
  select * into receipt from private.unmanaged_internal_profile_operations where operation_id=p_operation_id
    and actor_id=p_actor_id and user_id=p_user_id and email=p_email;
  return jsonb_build_object('current',observed,'receipt',case when receipt.operation_id is null then null
    else private.unmanaged_internal_profile_receipt(receipt) end);
end;
$$;
revoke all on function private.update_unmanaged_internal_profile(uuid,uuid,text,uuid,text,text,text,text),
  private.inspect_unmanaged_internal_profile_operation(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.update_unmanaged_internal_profile(uuid,uuid,text,uuid,text,text,text,text),
  private.inspect_unmanaged_internal_profile_operation(uuid,uuid,text,uuid) to service_role;
