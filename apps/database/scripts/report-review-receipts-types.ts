// Compile only after CI type generation from the complete historical schema.
import type { Database } from '../../../packages/types/src/supabase.js';

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Private = Database['private'];
export type ReportRevision = Assert<
  Equal<
    Private['Tables']['external_user_monthly_reports']['Row']['review_revision'],
    number
  >
>;
export type PostRevision = Assert<
  Equal<Private['Tables']['user_group_posts']['Row']['review_revision'], number>
>;
export type CheckRevision = Assert<
  Equal<
    Private['Tables']['user_group_post_checks']['Row']['review_revision'],
    number
  >
>;
export type ReceiptIdentity = Assert<
  Equal<
    Private['Tables']['report_review_receipts']['Row']['actor_auth_uid'],
    string
  >
>;
export type ReceiptDigest = Assert<
  Equal<
    Private['Tables']['report_review_receipts']['Row']['reviewed_payload_sha256'],
    string
  >
>;
export type PredicateResult = Assert<
  Equal<Private['Functions']['can_review_report_entry']['Returns'], boolean>
>;
export type ReadinessResult = Assert<
  Equal<
    Private['Functions']['report_review_delivery_ready']['Returns'],
    boolean
  >
>;
export type PredicateActor = Assert<
  Equal<
    Private['Functions']['can_review_report_entry']['Args']['p_actor_workspace_user_id'],
    string
  >
>;
