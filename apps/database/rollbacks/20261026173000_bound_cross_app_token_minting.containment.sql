-- MANUAL CONTAINMENT ONLY for #6840; NOT a rollback. Keep the bounded minting DDL.
-- Reverse-batch incident step 1: stop cross-app handoff routes, then run this before
-- 172000/170000/145300/145200/145100/145000 rollback files if those are approved.
-- Pauses client minting and revokes at most 1000 unused tokens per invocation.
-- Existing revoked tokens are NEVER restored; used tokens and expiry/audit fields
-- are unchanged. Existing handoffs can fail; users must mint new bounded tokens
-- after recovery. Original overlong-token revocations cannot safely be undone:
-- the migration stored no prior is_revoked values or per-migration provenance.
-- Admin/service credentials retain their existing grants: stop their callers too.
-- Read revoked_now/remaining; repeat bounded invocations until remaining=0 after
-- writers stop. SKIP LOCKED can leave busy rows; a nonzero count is NOT contained.
-- Re-enable authenticated minting only with an approved forward repair after the
-- bounds tests pass. Never restore vulnerable generator bodies or un-revoke rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.generate_cross_app_token(uuid, text, text, integer, jsonb)
  from public, anon, authenticated;
with batch as (
  select id from private.cross_app_tokens
  where used_at is null and is_revoked = false
  order by id for update skip locked limit 1000
), revoked as (
  update private.cross_app_tokens t set is_revoked = true
  from batch where t.id = batch.id returning t.id
)
select count(*)::integer as revoked_now from revoked;
select count(*)::bigint as remaining from private.cross_app_tokens
where used_at is null and is_revoked = false;
commit;
