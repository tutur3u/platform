-- Rollback: restore the prior readiness predicate, retaining the hardened path.
-- This restores the known readiness failure; apply only as an explicit rollback.
create or replace function private.employee_creation_runtime_ready(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
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
