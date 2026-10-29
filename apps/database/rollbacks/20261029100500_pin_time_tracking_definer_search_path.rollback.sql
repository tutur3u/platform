-- Not a migration: release-authority approval only.
-- Reverts 20261029100500 by unpinning the search_path of
-- private.handle_request_status_change and private.update_time_tracking_request.
-- The earlier path (`private, public, pg_temp`) is intentionally NOT restored:
-- its bare `public` violates the SECURITY DEFINER standard. The functions
-- fully schema-qualify their references, so an empty path is sufficient.
-- Never apply the 20261029100400 rollback after this one; it would reintroduce
-- `public` in the search_path.
-- Grants to anon or PUBLIC are never restored; service_role keeps EXECUTE.
begin;

alter function private.handle_request_status_change()
set search_path = '';

alter function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) set search_path = '';

commit;
