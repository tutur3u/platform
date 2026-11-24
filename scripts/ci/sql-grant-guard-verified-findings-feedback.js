// Source-bound product feedback findings whose reviewed grant is correct but
// whose marker spells the signature as timestamptz; the guard compares the
// marker against the normalized "timestamp with time zone" key.
const path =
  'apps/database/supabase/migrations/20261124141000_product_feedback_receipt_list.sql';
const fileDigest =
  '61cb47725f73007ea0e97d0bf7f1909bfacad7a2f542ee1a09de709bd8505cd3';
const reason =
  'The migration revokes ALL on public.list_product_feedback_receipts(integer, timestamptz, uuid) from PUBLIC, anon, authenticated and service_role, then grants EXECUTE to authenticated only under a reviewed(function-grant) marker. The SECURITY DEFINER body pins search_path to pg_catalog, pg_temp and returns only rows whose actor_id is auth.uid().';
module.exports = [
  {
    path,
    line: 4,
    rule: 'function-acl',
    fileDigest,
    digest: 'ec11cd770e1ac8aef1e97cbaba853a459745cc21410f7462011b47deb1bc3cc0',
    reason,
  },
  {
    path,
    line: 47,
    rule: 'function-acl',
    fileDigest,
    digest: '8ff4603d5b12afd2859b7282b7d2a8bf5063b8cdaf111bd80d71a0eff7869ac1',
    reason,
  },
];
