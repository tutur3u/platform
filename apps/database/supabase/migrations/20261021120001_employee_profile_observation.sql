-- Prove every name transition, allowing only completed RESTORE revision steps.
-- CREATE intent, operation, leases, receipts and history remain immutable.
create function private.employee_profile_lineage(p_user_id uuid,p_email text,p_name text,p_revision bigint,
  p_creation_actor uuid,p_creation_operation uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare current_name text; current_revision bigint:=0; step record; original_name text;
begin
  select managed_name into original_name from private.employee_creation_intents
    where user_id=p_user_id and staff_email=p_email;
  if not found then return false; end if;
  if p_creation_operation is not null and not exists(select 1 from private.employee_creation_operations
    where actor_id=p_creation_actor and operation_id=p_creation_operation and target_id=p_user_id
      and staff_email=p_email and managed_name=original_name and phase='active' and revoked_at is null) then
    return false;
  end if;
  current_name:=original_name;
  for step in
    select before_revision revision,before_name,after_name,staff_email,creation_actor_id,creation_operation_id,true renamed
      from private.employee_profile_renames where user_id=p_user_id
    union all
    select expected_revision,null,null,staff_email,null,null,false
      from private.employee_restore_operations where user_id=p_user_id and phase='completed'
    order by revision
  loop
    if step.revision<>current_revision or step.staff_email<>p_email then return false; end if;
    if step.renamed then
      if step.before_name<>current_name or step.creation_actor_id is distinct from p_creation_actor
        or step.creation_operation_id is distinct from p_creation_operation then return false; end if;
      current_name:=step.after_name;
    end if;
    current_revision:=current_revision+1;
  end loop;
  return current_revision=p_revision and current_name=p_name;
end;
$$;
revoke all on function private.employee_profile_lineage(uuid,text,text,bigint,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.employee_creation_runtime_inspect(p_actor_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.employee_creation_operations%rowtype; observed jsonb; account jsonb; profile jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('employee-address-reservations',0));
  perform private.assert_employee_administrator(p_actor_id);
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id;
  if not found then return jsonb_build_object('operation',null,'account',null); end if;
  observed:=private.inspect_employee_management(p_actor_id,op.target_id,op.staff_email);
  if observed->>'email'=op.staff_email and observed->'mailboxReady'='true'::jsonb
    and observed->>'registryState' in ('provisioned','active')
    and exists(select 1 from public.platform_user_roles where user_id=op.target_id and not enabled
      and not allow_challenge_management and not allow_manage_all_challenges and not allow_role_management)
    and (
      (op.phase<>'active' and observed->>'managedName'=op.managed_name)
      or (op.phase='active' and op.revoked_at is null and observed->>'registryState'='active'
        and private.employee_profile_lineage(op.target_id,op.staff_email,observed->>'managedName',
          (observed->>'revision')::bigint,op.actor_id,op.operation_id))
    ) then
    -- displayName is always the current verified profile; creationDisplayName
    -- independently binds the immutable request when the names differ.
    account:=jsonb_build_object('id',op.target_id,'email',op.staff_email,
      'displayName',observed->>'managedName',
      'status',case when observed->>'registryState'='active' then 'created' else 'pending' end);
    if observed->>'managedName'<>op.managed_name then
      profile:=private.inspect_employee_profile(p_actor_id,op.target_id,op.staff_email);
      if profile->'ready' is distinct from 'true'::jsonb then account:=null;
      else account:=account||jsonb_build_object('creationDisplayName',op.managed_name); end if;
    end if;
  end if;
  return jsonb_build_object('operation',private.employee_creation_operation_snapshot(op),'account',account);
end;
$$;
