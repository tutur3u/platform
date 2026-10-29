-- Pin the SECURITY DEFINER search_path of the time tracking request functions
-- to pg_catalog, pg_temp (least privilege) and fix rejecting a linked request.
--
-- 0. Contract verifier form. The security-egress catalog verifier
--    (tests/security-definer-search-paths.sql) only accepts a path made of
--    existing, non-creatable schemas that ends in pg_temp; an empty path is
--    rejected because it permits implicit pg_temp type lookup. The two
--    reference-workspace guard functions from 20261029100400 were pinned to
--    `''`, so they are re-pinned to pg_catalog, pg_temp here. Their bodies
--    already qualify every relation and type (public.*) and use no
--    unqualified function other than pg_catalog built-ins.
--
-- 1. search_path. 20261029100400 left
--    private.handle_request_status_change() and
--    private.update_time_tracking_request(...) with
--    `search_path = private, public, pg_temp`. Both bodies schema-qualify every
--    relation, function and type they touch (private.*, public.*, pg_catalog.*),
--    so the bare `public` is not needed. update_time_tracking_request keeps its
--    body (ALTER FUNCTION only).
--
-- 2. Product bug: "rejecting a linked time-tracking request fails". A direct
--    UPDATE of a private.time_tracking_requests row with a linked_session_id to
--    REJECTED raised SQLSTATE 27000 ("tuple to be updated was already modified
--    by an operation triggered by the current command"). The BEFORE UPDATE
--    trigger deleted the linked session, and the ON DELETE SET NULL foreign key
--    on linked_session_id then updated the very request row that was being
--    updated. The BEFORE trigger now only clears NEW.linked_session_id, and a
--    new AFTER UPDATE trigger deletes the session keyed on OLD.linked_session_id,
--    scoped to the request workspace and user. Approve (session kept, pending
--    flag cleared) and needs_info (session kept) are unchanged.
begin;

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
      -- The linked session is deleted by the AFTER UPDATE trigger
      -- (private.delete_rejected_request_linked_session). Deleting it here
      -- would make the ON DELETE SET NULL foreign key update this request row
      -- while it is already being updated (SQLSTATE 27000).
      new.linked_session_id := null;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.delete_rejected_request_linked_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  if old.linked_session_id is not null then
    delete from public.time_tracking_sessions
    where id = old.linked_session_id
      and ws_id = old.workspace_id
      and user_id = old.user_id;
  end if;

  return null;
end;
$function$;

comment on function private.delete_rejected_request_linked_session()
is 'Deletes the session linked to a time-tracking request after the request is rejected.';

drop trigger if exists trigger_delete_rejected_request_linked_session
on private.time_tracking_requests;

create trigger trigger_delete_rejected_request_linked_session
after update on private.time_tracking_requests
for each row
when (
  old.approval_status is distinct from new.approval_status
  and new.approval_status = 'REJECTED'
  and old.linked_session_id is not null
)
execute function private.delete_rejected_request_linked_session();

-- tuturuuu: reviewed(alter-routine-review): keeps the security-reviewed safe path pg_catalog, pg_temp (Tess B1, #7281)
alter function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) set search_path = pg_catalog, pg_temp;

-- tuturuuu: reviewed(alter-routine-review): keeps the security-reviewed safe path pg_catalog, pg_temp (Tess B1, #7281)
alter function public.enforce_time_tracking_session_category_workspace()
set search_path = pg_catalog, pg_temp;

-- tuturuuu: reviewed(alter-routine-review): keeps the security-reviewed safe path pg_catalog, pg_temp (Tess B1, #7281)
alter function private.enforce_time_tracking_request_reference_workspace()
set search_path = pg_catalog, pg_temp;

-- Restate the ACL so this file is self-contained.
revoke all on function private.handle_request_status_change()
from public, anon, authenticated;

revoke all on function private.delete_rejected_request_linked_session()
from public, anon, authenticated;

revoke all on function public.enforce_time_tracking_session_category_workspace()
from public, anon, authenticated;

revoke all on function private.enforce_time_tracking_request_reference_workspace()
from public, anon, authenticated;

revoke all on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function private.handle_request_status_change()
to service_role;

grant execute on function private.delete_rejected_request_linked_session()
to service_role;

grant execute on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) to service_role;

commit;
