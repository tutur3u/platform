// Compile against the actual generated complete historical schema.
import type { Database, Json } from '../../../packages/types/src/supabase.js';

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Private = Database['private'];
type Queue = Private['Tables']['user_report_email_queue']['Row'];
type Report = Private['Tables']['external_user_monthly_reports']['Row'];
type Attempt = Private['Tables']['user_report_email_attempts']['Row'];
type Functions = Private['Functions'];
export type ReportDelivery = Assert<Equal<Report['delivery_status'], string>>;
export type ReportReceiptTime = Assert<
  Equal<Report['delivered_at'], string | null>
>;
export type QueueLease = Assert<Equal<Queue['locked_at'], string | null>>;
export type QueueOwner = Assert<Equal<Queue['locked_by'], string | null>>;
export type QueueProviderId = Assert<
  Equal<Queue['provider_message_id'], string | null>
>;
export type AttemptProviderId = Assert<
  Equal<Attempt['provider_message_id'], string | null>
>;
export type AttemptQueue = Assert<Equal<Attempt['queue_id'], string>>;
export type RequestScope = Assert<
  Equal<
    Functions['request_periodic_report_delivery']['Args']['p_ws_id'],
    string
  >
>;
export type RequestEnabled = Assert<
  Equal<
    Functions['request_periodic_report_delivery']['Args']['p_delivery_enabled'],
    boolean | undefined
  >
>;
export type RequestResult = Assert<
  Equal<Functions['request_periodic_report_delivery']['Returns'], Json>
>;
export type ClaimResult = Assert<
  Equal<Functions['claim_periodic_report_emails']['Returns'], Queue[]>
>;
export type CompletionOwner = Assert<
  Equal<
    Functions['finish_periodic_report_email']['Args']['p_worker_id'],
    string
  >
>;
export type CompletionLease = Assert<
  Equal<
    Functions['finish_periodic_report_email']['Args']['p_locked_at'],
    string
  >
>;
export type CompletionResult = Assert<
  Equal<Functions['finish_periodic_report_email']['Returns'], boolean>
>;
export type StageResult = Assert<
  Equal<Functions['periodic_report_stage']['Returns'], string>
>;
export type CountResult = Assert<
  Equal<Functions['get_periodic_report_stage_counts']['Returns'], Json>
>;
export type ContractReadiness = Assert<
  Equal<
    Functions['periodic_report_delivery_contract_ready']['Returns'],
    boolean
  >
>;

export type SearchScope = Assert<
  Equal<Functions['search_periodic_reports']['Args']['p_ws_id'], string>
>;
export type SearchDeliveryTime = Assert<
  Equal<
    Functions['search_periodic_reports']['Returns'][number]['delivered_at'],
    string | null
  >
>;
