import type { calculateBillSplit } from '@tuturuuu/finance-core/bill-splitting';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';

type CreateArguments = {
  p_ws_id: string;
  p_actor_id: string;
  p_id: string;
  p_title: string;
  p_currency: string;
  p_minor_digits: number;
  p_participants: Json;
  p_input: Json;
  p_ledger: ReturnType<typeof calculateBillSplit>;
  p_finalized: boolean;
};

type ReadArguments = {
  p_ws_id: string;
  p_actor_id: string;
  p_id?: string;
};

type ActivityArguments = {
  p_ws_id: string;
  p_actor_id: string;
  p_split_id: string;
  p_event_id: string;
  p_kind: string;
  p_comment?: string;
  p_from_id?: string;
  p_to_id?: string;
  p_amount_minor?: number;
  p_report_id?: string;
};

type LinkArguments = {
  p_ws_id: string;
  p_actor_id: string;
  p_split_id: string;
  p_digest?: string;
  p_hours?: number;
  p_participant_id?: string;
  p_public_name?: string;
  p_revoke_id?: string;
  p_receiving_participant_id?: string;
  p_expected_consent_revision?: string;
};

type BankArguments = {
  p_ws_id: string;
  p_actor_id: string;
  p_contact_id: string;
  p_action:
    | 'consent'
    | 'revoke'
    | 'masked_read'
    | 'qr'
    | 'public_qr'
    | 'share_account';
  p_bank_name?: string;
  p_bank_bin?: string;
  p_last_four?: string;
  p_encrypted_details?: string;
  p_consent_revision?: string;
};

type ReportProofArguments = Required<
  Pick<
    ActivityArguments,
    | 'p_ws_id'
    | 'p_actor_id'
    | 'p_split_id'
    | 'p_event_id'
    | 'p_from_id'
    | 'p_to_id'
    | 'p_amount_minor'
  >
> & { p_content_type: string; p_proof_base64: string };

type Result<T> = PromiseLike<{
  data: T | null;
  error: { code: string } | null;
}>;

type PrivateBillSplitRpc = {
  rpc(name: 'create_finance_bill_split', args: CreateArguments): Result<string>;
  rpc(name: 'read_finance_bill_splits', args: ReadArguments): Result<Json>;
  rpc(
    name: 'schedule_finance_bill_split_reminder',
    args: {
      p_ws_id: string;
      p_actor_id: string;
      p_split_id: string;
      p_participant_id: string;
    }
  ): Result<string>;
  rpc(
    name: 'report_finance_bill_split_with_proof',
    args: ReportProofArguments
  ): Result<string>;
  rpc(
    name: 'read_finance_bill_split_proof',
    args: {
      p_ws_id: string;
      p_actor_id: string;
      p_split_id: string;
      p_report_id: string;
    }
  ): Result<Json>;
  rpc(
    name: 'list_finance_bill_split_links',
    args: Omit<ReadArguments, 'p_id'> & { p_split_id: string }
  ): Result<Json>;
  rpc(name: 'finance_contact_bank_command', args: BankArguments): Result<Json>;
  rpc(
    name: 'manage_finance_bill_split_link',
    args: LinkArguments
  ): Result<string>;
  rpc(
    name: 'lookup_finance_bill_split_link',
    args: { p_digest: string }
  ): Result<Json>;
  rpc(
    name: 'write_finance_bill_split_activity',
    args: ActivityArguments
  ): Result<string>;
  rpc(
    name:
      | 'read_finance_bill_split_activity'
      | 'finance_bill_split_confirmed_payments',
    args: Omit<ReadArguments, 'p_id'> & { p_split_id: string }
  ): Result<Json>;
};

/** Narrow contract for the private RPCs in the bill split migration. */
export function billSplitStore(admin: TypedSupabaseClient) {
  return admin.schema('private') as unknown as PrivateBillSplitRpc;
}
