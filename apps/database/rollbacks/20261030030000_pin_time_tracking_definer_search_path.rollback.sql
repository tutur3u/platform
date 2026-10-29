-- Not a migration: release-authority approval only.
-- Reverts the BEHAVIOUR of 20261030030000 only: drops the AFTER UPDATE trigger
-- (and its function) that deletes the session linked to a rejected
-- time-tracking request, and restores the 20261029100400 body of
-- private.handle_request_status_change (the BEFORE UPDATE trigger deletes the
-- linked session itself, which reintroduces the SQLSTATE 27000 failure when a
-- linked request is rejected).
--
-- The safe search_path is intentionally KEPT. Every function touched here, and
-- the two reference-workspace guards plus update_time_tracking_request, stay on
-- `search_path = pg_catalog, pg_temp`. Neither `''` (permits implicit pg_temp
-- type lookup; rejected by the security egress contract verifier) nor
-- `private, public, pg_temp` (bare `public` violates the SECURITY DEFINER
-- standard) is ever restored. The bodies fully schema-qualify their references
-- (`now()` below is a pg_catalog built-in), so the pinned path is sufficient.
-- Never apply the 20261029100400 rollback after this one; it would reintroduce
-- an unsafe search_path.
-- Grants to PUBLIC, anon or authenticated are never restored; service_role keeps
-- EXECUTE.
begin;

drop trigger if exists trigger_delete_rejected_request_linked_session
on private.time_tracking_requests;
drop function if exists private.delete_rejected_request_linked_session();

create or replace function private.handle_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  if old.approval_status = new.approval_status then
    return new;
  end if;

  if new.linked_session_id is not null then
    if new.approval_status = 'APPROVED' then
      update public.time_tracking_sessions
      set pending_approval = false,
          updated_at = pg_catalog.now()
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

-- Re-assert the safe path on the functions this migration pinned; a no-op on a
-- database where the forward migration is applied, and never an unpin.
alter function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) set search_path = pg_catalog, pg_temp;

alter function public.enforce_time_tracking_session_category_workspace()
set search_path = pg_catalog, pg_temp;
alter function private.enforce_time_tracking_request_reference_workspace()
set search_path = pg_catalog, pg_temp;

revoke all on function private.handle_request_status_change()
from public, anon, authenticated;
grant execute on function private.handle_request_status_change()
to service_role;

commit;
