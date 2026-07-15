create or replace function audit.find_workspace_user_status_audit_record(
  p_ws_id uuid,
  p_user_id uuid,
  p_archived boolean,
  p_archived_until timestamptz,
  p_actor_auth_uid uuid,
  p_created_at timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = public, audit
as $function$
  select audit_log.id
  from audit.record_version audit_log
  where audit_log.table_oid = 'public.workspace_users'::regclass
    and audit_log.ts >= p_created_at - interval '2 minutes'
    and audit_log.ts <= p_created_at + interval '5 seconds'
    and public.workspace_user_audit_ws_id(
      audit_log.record,
      audit_log.old_record
    ) = p_ws_id
    and public.workspace_user_audit_user_id(
      audit_log.record,
      audit_log.old_record
    ) = p_user_id
    and public.workspace_user_audit_event_kind(
      audit_log.op,
      audit_log.record,
      audit_log.old_record
    ) in ('archived', 'reactivated', 'archive_until_changed')
    and coalesce((audit_log.record->>'archived')::boolean, false) = p_archived
    and nullif(audit_log.record->>'archived_until', '')::timestamptz
      is not distinct from p_archived_until
    and (
      p_actor_auth_uid is null
      or audit_log.auth_uid is not distinct from p_actor_auth_uid
    )
    and not exists (
      select 1
      from public.workspace_user_status_changes linked_status
      where linked_status.audit_record_version_id = audit_log.id
    )
  order by
    abs(extract(epoch from (p_created_at - audit_log.ts))) asc,
    audit_log.id desc
  limit 1;
$function$;

create or replace function audit.link_workspace_user_status_audit_record()
returns trigger
language plpgsql
security definer
set search_path = public, audit
as $function$
begin
  if new.source = 'live' and new.audit_record_version_id is null then
    new.audit_record_version_id :=
      audit.find_workspace_user_status_audit_record(
        new.ws_id,
        new.user_id,
        new.archived,
        new.archived_until,
        new.actor_auth_uid,
        new.created_at
      );
  end if;

  return new;
end;
$function$;

revoke execute on function audit.find_workspace_user_status_audit_record(
  uuid,
  uuid,
  boolean,
  timestamptz,
  uuid,
  timestamptz
) from public, anon, authenticated;

revoke execute on function audit.link_workspace_user_status_audit_record()
from public, anon, authenticated;

drop trigger if exists link_workspace_user_status_audit_record
on public.workspace_user_status_changes;

create trigger link_workspace_user_status_audit_record
before insert on public.workspace_user_status_changes
for each row
execute function audit.link_workspace_user_status_audit_record();

with candidate_matches as (
  select
    status_change.id as status_change_id,
    status_change.created_at,
    audit.find_workspace_user_status_audit_record(
      status_change.ws_id,
      status_change.user_id,
      status_change.archived,
      status_change.archived_until,
      status_change.actor_auth_uid,
      status_change.created_at
    ) as audit_record_version_id
  from public.workspace_user_status_changes status_change
  where status_change.source = 'live'
    and status_change.audit_record_version_id is null
),
ranked_matches as (
  select
    candidate_matches.*,
    row_number() over (
      partition by candidate_matches.audit_record_version_id
      order by candidate_matches.created_at asc, candidate_matches.status_change_id
    ) as audit_match_rank
  from candidate_matches
  where candidate_matches.audit_record_version_id is not null
)
update public.workspace_user_status_changes status_change
set audit_record_version_id = ranked_matches.audit_record_version_id
from ranked_matches
where status_change.id = ranked_matches.status_change_id
  and ranked_matches.audit_match_rank = 1;
