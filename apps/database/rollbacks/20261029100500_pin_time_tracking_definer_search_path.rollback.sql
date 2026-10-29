-- Not a migration: release-authority approval only.
-- Reverts 20261029100500: drops the AFTER UPDATE trigger that deletes the
-- session linked to a rejected time-tracking request, restores the 20261029100400
-- body of private.handle_request_status_change (the BEFORE UPDATE trigger
-- deletes the linked session itself, which reintroduces the SQLSTATE 27000
-- failure when a linked request is rejected), and unpins the search_path of
-- private.update_time_tracking_request.
-- The earlier path (`private, public, pg_temp`) is intentionally NOT restored:
-- its bare `public` violates the SECURITY DEFINER standard. The functions
-- fully schema-qualify their references, so an empty path is sufficient.
-- Never apply the 20261029100400 rollback after this one; it would reintroduce
-- `public` in the search_path.
-- Grants to anon or PUBLIC are never restored; service_role keeps EXECUTE.
begin;

drop trigger if exists trigger_delete_rejected_request_linked_session
on private.time_tracking_requests;
drop function if exists private.delete_rejected_request_linked_session();

create or replace function private.handle_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.approval_status = new.approval_status then
    return new;
  end if;

  if new.linked_session_id is not null then
    if new.approval_status = 'APPROVED' then
      update public.time_tracking_sessions
      set pending_approval = false,
          updated_at = now()
      where id = new.linked_session_id
        and ws_id = new.workspace_id
        and user_id = new.user_id;
    elsif new.approval_status = 'REJECTED' then
      delete from public.time_tracking_sessions
      where id = new.linked_session_id
        and ws_id = new.workspace_id
        and user_id = new.user_id;

      new.linked_session_id := null;
    end if;
  end if;

  return new;
end;
$function$;

alter function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) set search_path = '';

revoke all on function private.handle_request_status_change()
from public, anon, authenticated;
grant execute on function private.handle_request_status_change()
to service_role;

commit;
