-- Pin the SECURITY DEFINER search_path of the time tracking request functions
-- to pg_catalog, pg_temp (least privilege).
--
-- 20261029100400 left private.handle_request_status_change() and
-- private.update_time_tracking_request(...) with
-- `search_path = private, public, pg_temp`. Both bodies already schema-qualify
-- every relation, function and type they touch (private.*, public.*); the only
-- unqualified names are pg_catalog built-ins, so the bare `public` is not
-- needed. Bodies, signatures and semantics are unchanged.
begin;

alter function private.handle_request_status_change()
set search_path = pg_catalog, pg_temp;

alter function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) set search_path = pg_catalog, pg_temp;

-- ALTER FUNCTION keeps the ACL; restate it so this file is self-contained.
revoke all on function private.handle_request_status_change()
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

grant execute on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) to service_role;

commit;
