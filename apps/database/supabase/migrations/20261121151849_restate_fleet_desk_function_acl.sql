-- Restate the Fleet desk EXECUTE privileges. 20261121140100 and
-- 20261121140101 replace routines whose earlier definitions already
-- revoked these grants. PostgreSQL keeps that ACL on CREATE OR REPLACE,
-- and those applied files stay byte-for-byte unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all on function private.fleet_verify_link_code(bytea, bytea, jsonb)
  from public, anon, authenticated;
grant execute on function private.fleet_verify_link_code(bytea, bytea, jsonb)
  to service_role;

revoke all on function private.fleet_submit_resolved_intent(private.fleet_intent_kind, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function private.fleet_submit_resolved_intent(private.fleet_intent_kind, text, text, jsonb, uuid, jsonb, text)
  to service_role;

revoke all on function private.fleet_get_digest(uuid)
  from public, anon, authenticated;
grant execute on function private.fleet_get_digest(uuid)
  to service_role;

-- tuturuuu: no-grant (trigger)
revoke all on function private.fleet_admit_intent()
  from public, anon, authenticated, service_role;

commit;
