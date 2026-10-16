-- Service-only observation for the HTTP RPC adapter. Never acknowledges a write
-- using its own transaction's JSON: the adapter reads persisted state separately.
create function private.employee_creation_runtime_ready(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare signature text; fn pg_proc%rowtype;
begin
  perform private.assert_employee_administrator(p_actor_id);
  foreach signature in array array[
    'private.employee_creation_operation_claim(uuid,uuid,text,text)',
    'private.employee_creation_operation_advance(uuid,uuid,uuid,integer,uuid,text,jsonb)',
    'private.employee_creation_operation_revoke(uuid,uuid)',
    'private.employee_creation_preflight(uuid,uuid,text,text)',
    'private.finalize_employee_creation(uuid,uuid,text,text)',
    'private.confirm_employee_activation(uuid,uuid,text)',
    'private.employee_creation_runtime_inspect(uuid,uuid)'
  ] loop
    select * into fn from pg_proc where oid=to_regprocedure(signature);
    if not found or not fn.prosecdef or fn.proconfig is distinct from array['search_path=""']::text[]
      or has_function_privilege('anon',fn.oid,'EXECUTE')
      or has_function_privilege('authenticated',fn.oid,'EXECUTE')
      or not has_function_privilege('service_role',fn.oid,'EXECUTE')
      or exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception using errcode='42501',message='Employee runtime contract unavailable';
    end if;
  end loop;
  return jsonb_build_object('ready',true,'contract','employee-http-rpc-v1',
    'finalizeSha256',encode(extensions.digest(pg_get_functiondef(
      'private.finalize_employee_creation(uuid,uuid,text,text)'::regprocedure),'sha256'),'hex'),
    'confirmSha256',encode(extensions.digest(pg_get_functiondef(
      'private.confirm_employee_activation(uuid,uuid,text)'::regprocedure),'sha256'),'hex'));
end;
$$;

create function private.employee_creation_runtime_inspect(p_actor_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.employee_creation_operations%rowtype; observed jsonb; account jsonb;
begin
  perform private.assert_employee_administrator(p_actor_id);
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id;
  if not found then return jsonb_build_object('operation',null,'account',null); end if;
  observed:=private.inspect_employee_management(p_actor_id,op.target_id,op.staff_email);
  if observed->>'email'=op.staff_email and observed->>'managedName'=op.managed_name
    and observed->'mailboxReady'='true'::jsonb
    and observed->>'registryState' in ('provisioned','active')
    and exists(select 1 from public.platform_user_roles where user_id=op.target_id and not enabled
      and not allow_challenge_management and not allow_manage_all_challenges and not allow_role_management) then
    account:=jsonb_build_object('id',op.target_id,'email',op.staff_email,'displayName',op.managed_name,
      'status',case when observed->>'registryState'='active' then 'created' else 'pending' end);
  end if;
  return jsonb_build_object('operation',private.employee_creation_operation_snapshot(op),'account',account);
end;
$$;
revoke all on function private.employee_creation_runtime_ready(uuid),
  private.employee_creation_runtime_inspect(uuid,uuid) from public,anon,authenticated;
grant execute on function private.employee_creation_runtime_ready(uuid),
  private.employee_creation_runtime_inspect(uuid,uuid) to service_role;
