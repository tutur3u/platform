-- Human adjudication is distinct from provider observation and ordinary retry.
create table private.employee_creation_rejection_adjudications (
  actor_id uuid not null,
  operation_id uuid not null,
  adjudicator_id uuid not null references public.users(id),
  event_id uuid not null unique,
  original_attempt_event_id uuid not null,
  original_lease_id uuid not null,
  expected_version integer not null check (expected_version=2),
  evidence_reference_sha256 text not null check (evidence_reference_sha256 ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason='administrator_adjudicated_terminal_auth_rejection'),
  attestation jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,operation_id),
  foreign key(actor_id,operation_id,event_id)
    references private.employee_creation_operation_history(actor_id,operation_id,event_id),
  foreign key(actor_id,operation_id,original_attempt_event_id)
    references private.employee_creation_operation_history(actor_id,operation_id,event_id)
);
alter table private.employee_creation_rejection_adjudications enable row level security;
revoke all on private.employee_creation_rejection_adjudications from public,anon,authenticated,service_role;

create function private.adjudicate_employee_creation_rejection(
  p_adjudicator_id uuid,p_actor_id uuid,p_operation_id uuid,p_target_id uuid,
  p_email text,p_name text,p_expected_version integer,p_original_lease_id uuid,
  p_original_attempt_event_id uuid,p_event_id uuid,p_evidence_reference_sha256 text,
  p_reason text,p_attestation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  op private.employee_creation_operations%rowtype;
  intent private.employee_creation_intents%rowtype;
  attempt private.employee_creation_operation_history%rowtype;
  uncertain private.employee_creation_operation_history%rowtype;
  fence uuid := gen_random_uuid();
begin
  -- Same absent-key serialization and Auth -> operation -> intent lock order as claim.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||':'||p_operation_id::text,0));
  perform private.lock_employee_auth_pair(p_actor_id,p_target_id);
  perform private.assert_employee_administrator(p_adjudicator_id);
  -- This narrowly admitted repair belongs to the original, freshly authorized actor.
  if p_adjudicator_id is distinct from p_actor_id then
    raise exception using errcode='42501',message='Employee adjudicator must own original operation';
  end if;
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id for update;
  if not found or p_expected_version is distinct from 2 or op.version<>2 or op.phase<>'unknown'
    or op.target_id is distinct from p_target_id or op.staff_email is distinct from p_email
    or op.managed_name is distinct from p_name or op.lease_id is distinct from p_original_lease_id
    or op.revoked_at is not null or op.lease_expires_at>clock_timestamp() or op.last_receipt is not null
    or exists(select 1 from private.employee_creation_rejection_adjudications
      where actor_id=p_actor_id and operation_id=p_operation_id) then
    raise exception using errcode='23514',message='Employee rejection recovery state denied';
  end if;
  if p_event_id is null or p_original_attempt_event_id is null
    or p_evidence_reference_sha256 is null or p_evidence_reference_sha256 !~ '^[a-f0-9]{64}$'
    or p_reason is distinct from 'administrator_adjudicated_terminal_auth_rejection'
    or p_attestation is distinct from '{"kind":"administrator-adjudication-v1","terminalAuthRejection":true,"noRequestInFlight":true,"absenceIsNotRejectionProof":true,"acceptResponsibility":true}'::jsonb then
    raise exception using errcode='23514',message='Employee rejection attestation required';
  end if;
  select * into attempt from private.employee_creation_operation_history
    where actor_id=p_actor_id and operation_id=p_operation_id and resulting_version=1;
  select * into uncertain from private.employee_creation_operation_history
    where actor_id=p_actor_id and operation_id=p_operation_id and resulting_version=2;
  if (select count(*) from private.employee_creation_operation_history
      where actor_id=p_actor_id and operation_id=p_operation_id)<>2
    or attempt.event_id is distinct from p_original_attempt_event_id
    or attempt.lease_id is distinct from p_original_lease_id
    or attempt.expected_version is distinct from 0 or attempt.previous_phase is distinct from 'reserved'
    or attempt.next_phase is distinct from 'auth_attempted' or attempt.receipt is not null
    or uncertain.lease_id is distinct from p_original_lease_id
    or uncertain.expected_version is distinct from 1 or uncertain.previous_phase is distinct from 'auth_attempted'
    or uncertain.next_phase is distinct from 'unknown' or uncertain.receipt is not null
    or uncertain.created_at<attempt.created_at then
    raise exception using errcode='23514',message='Employee rejection history denied';
  end if;
  -- Lock the existing intent rather than allowing preflight to manufacture one.
  for intent in select * from private.employee_creation_intents
    where user_id=p_target_id or staff_email=p_email order by user_id for update loop
    if intent.actor_id is distinct from p_actor_id or intent.user_id is distinct from p_target_id
      or intent.staff_email is distinct from p_email or intent.managed_name is distinct from p_name then
      raise exception using errcode='23514',message='Employee rejection reservation denied';
    end if;
  end loop;
  if not exists(select 1 from private.employee_creation_intents where user_id=p_target_id
      and actor_id=p_actor_id and staff_email=p_email and managed_name=p_name)
    or exists(select 1 from private.employee_creation_operations where (target_id=p_target_id or staff_email=p_email)
      and (actor_id<>p_actor_id or operation_id<>p_operation_id))
    or exists(select 1 from private.employee_restore_operations where user_id=p_target_id or staff_email=p_email)
    or exists(select 1 from private.employee_address_migrations where user_id=p_target_id
      or source_address=p_email or destination_address=p_email)
    or exists(select 1 from auth.identities where user_id=p_target_id or lower(identity_data->>'email')=p_email)
    or exists(select 1 from auth.users where id=p_target_id or lower(email)=p_email)
    or exists(select 1 from public.users where id=p_target_id)
    or exists(select 1 from public.user_private_details where user_id=p_target_id or lower(email)=p_email)
    or exists(select 1 from private.infrastructure_employees where user_id=p_target_id or staff_email=p_email)
    or exists(select 1 from private.mail_mailboxes where lower(address)=p_email or created_by=p_target_id)
    or exists(select 1 from private.mail_mailbox_members where user_id=p_target_id)
    or exists(select 1 from public.platform_user_roles where user_id=p_target_id)
    or exists(select 1 from public.platform_email_roles where lower(email)=p_email) then
    raise exception using errcode='23514',message='Employee rejection absence guard denied';
  end if;
  insert into private.employee_creation_operation_history(actor_id,operation_id,event_id,lease_id,
    expected_version,previous_phase,next_phase,receipt,resulting_version)
  values(p_actor_id,p_operation_id,p_event_id,p_original_lease_id,2,'unknown','reserved',
    jsonb_build_object('kind','administrator-adjudicated-rejection','adjudicatorId',p_adjudicator_id,
      'evidenceReferenceSha256',p_evidence_reference_sha256,'reason',p_reason,
      'expectedVersion',2,'originalAttemptEventId',p_original_attempt_event_id,
      'originalLeaseId',p_original_lease_id,'attestation',p_attestation),3);
  insert into private.employee_creation_rejection_adjudications(actor_id,operation_id,adjudicator_id,
    event_id,original_attempt_event_id,original_lease_id,expected_version,evidence_reference_sha256,reason,attestation)
  values(p_actor_id,p_operation_id,p_adjudicator_id,p_event_id,p_original_attempt_event_id,
    p_original_lease_id,2,p_evidence_reference_sha256,p_reason,p_attestation);
  update private.employee_creation_operations set phase='reserved',version=3,lease_id=fence,
    lease_expires_at=clock_timestamp()-interval '1 second',updated_at=clock_timestamp()
    where actor_id=p_actor_id and operation_id=p_operation_id returning * into op;
  return jsonb_build_object('kind','adjudicated','operation',private.employee_creation_operation_snapshot(op));
end;
$$;
revoke all on function private.adjudicate_employee_creation_rejection(uuid,uuid,uuid,uuid,text,text,integer,uuid,uuid,uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function private.adjudicate_employee_creation_rejection(uuid,uuid,uuid,uuid,text,text,integer,uuid,uuid,uuid,text,text,jsonb)
  to service_role;

-- Read-only recovery admission/readback. Candidate status is never rejection proof.
create function private.inspect_employee_creation_rejection(p_actor_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.employee_creation_operations%rowtype;
  attempt private.employee_creation_operation_history%rowtype;
  audit private.employee_creation_rejection_adjudications%rowtype;
  identity jsonb;
begin
  perform private.assert_employee_administrator(p_actor_id);
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id;
  if not found or op.revoked_at is not null or op.last_receipt is not null
    or op.lease_expires_at>clock_timestamp() then
    return jsonb_build_object('status','fenced','operationId',p_operation_id);
  end if;
  select * into attempt from private.employee_creation_operation_history
    where actor_id=p_actor_id and operation_id=p_operation_id and resulting_version=1
      and expected_version=0 and previous_phase='reserved' and next_phase='auth_attempted' and receipt is null;
  if not found then return jsonb_build_object('status','fenced','operationId',p_operation_id); end if;
  identity=jsonb_build_object('actorUserId',op.actor_id,'operationId',op.operation_id,
    'targetUserId',op.target_id,'email',op.staff_email,'displayName',op.managed_name,
    'originalLeaseId',attempt.lease_id,'originalAttemptEventId',attempt.event_id);
  select * into audit from private.employee_creation_rejection_adjudications
    where actor_id=p_actor_id and operation_id=p_operation_id;
  if found and op.phase='reserved' and op.version=3 and op.lease_id<>audit.original_lease_id
    and audit.original_attempt_event_id=attempt.event_id and audit.original_lease_id=attempt.lease_id
    and exists(select 1 from private.employee_creation_operation_history where actor_id=p_actor_id
      and operation_id=p_operation_id and event_id=audit.event_id and resulting_version=3
      and previous_phase='unknown' and next_phase='reserved') then
    return identity||jsonb_build_object('status','retry_ready','expectedVersion',3,
      'eventId',audit.event_id,'evidenceReferenceSha256',audit.evidence_reference_sha256);
  elsif not found and op.phase='unknown' and op.version=2 and op.lease_id=attempt.lease_id
    and (select count(*) from private.employee_creation_operation_history
      where actor_id=p_actor_id and operation_id=p_operation_id)=2
    and exists(select 1 from private.employee_creation_operation_history where actor_id=p_actor_id
      and operation_id=p_operation_id and resulting_version=2 and expected_version=1
      and previous_phase='auth_attempted' and next_phase='unknown' and receipt is null and lease_id=attempt.lease_id) then
    return identity||jsonb_build_object('status','eligible','expectedVersion',2);
  end if;
  return jsonb_build_object('status','fenced','operationId',p_operation_id);
end;
$$;
revoke all on function private.inspect_employee_creation_rejection(uuid,uuid) from public,anon,authenticated;
grant execute on function private.inspect_employee_creation_rejection(uuid,uuid) to service_role;
