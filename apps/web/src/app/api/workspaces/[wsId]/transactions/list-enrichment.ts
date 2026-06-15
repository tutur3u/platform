import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export type TransactionListEnrichment = {
  wallet_currency: string | null;
  wallet_icon: string | null;
  wallet_image_src: string | null;
  tags: Array<{ id: string; name: string; color: string }>;
  transfer:
    | {
        linked_transaction_id: string;
        linked_wallet_id: string;
        linked_wallet_name: string;
        linked_wallet_currency?: string;
        linked_amount?: number;
        linked_amount_redacted?: boolean;
        linked_is_amount_confidential?: boolean;
        is_origin: boolean;
      }
    | undefined;
};

type RawTransactionListEnrichmentRow = {
  tags: unknown;
  transaction_id: string;
  transfer: unknown;
  wallet_currency: string | null;
  wallet_icon: string | null;
  wallet_image_src: string | null;
};

type LoadTransactionListEnrichmentInput = {
  normalizedWsId: string;
  route: string;
  supabase: TypedSupabaseClient;
  transactionIds: string[];
  userId: string;
};

function getErrorField(error: unknown, field: string) {
  if (!error || typeof error !== 'object' || !(field in error)) {
    return null;
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  const fields = ['code', 'message', 'details', 'hint']
    .map((field) => getErrorField(error, field))
    .filter((value): value is string => Boolean(value));

  if (fields.length > 0) {
    return fields.join(' ');
  }

  return typeof error === 'string' ? error : '';
}

function isRecoverableEnrichmentError(error: unknown) {
  const code = getErrorField(error, 'code');
  const errorText = getErrorText(error).toLowerCase();

  return (
    code === 'PGRST202' ||
    code === '42804' ||
    errorText.includes('permission denied') ||
    errorText.includes('could not find the function') ||
    errorText.includes('schema cache') ||
    errorText.includes('does not match expected type') ||
    (errorText.includes('return') &&
      errorText.includes('type') &&
      errorText.includes('match'))
  );
}

function normalizeTags(tags: unknown) {
  return Array.isArray(tags)
    ? tags
        .filter(
          (tag): tag is { id: string; name: string; color?: string | null } =>
            !!tag &&
            typeof tag === 'object' &&
            'id' in tag &&
            'name' in tag &&
            typeof tag.id === 'string' &&
            typeof tag.name === 'string'
        )
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: typeof tag.color === 'string' ? tag.color : '',
        }))
    : [];
}

function normalizeTransfer(
  transfer: unknown
): TransactionListEnrichment['transfer'] {
  if (
    !transfer ||
    typeof transfer !== 'object' ||
    !('linked_transaction_id' in transfer) ||
    !('linked_wallet_id' in transfer) ||
    !('linked_wallet_name' in transfer)
  ) {
    return undefined;
  }

  const transferRecord = transfer as Record<string, unknown>;

  return {
    linked_transaction_id: String(transferRecord.linked_transaction_id),
    linked_wallet_id: String(transferRecord.linked_wallet_id),
    linked_wallet_name: String(transferRecord.linked_wallet_name),
    linked_wallet_currency:
      typeof transferRecord.linked_wallet_currency === 'string'
        ? transferRecord.linked_wallet_currency
        : undefined,
    linked_amount:
      typeof transferRecord.linked_amount === 'number'
        ? transferRecord.linked_amount
        : undefined,
    linked_amount_redacted:
      typeof transferRecord.linked_amount_redacted === 'boolean'
        ? transferRecord.linked_amount_redacted
        : undefined,
    linked_is_amount_confidential:
      typeof transferRecord.linked_is_amount_confidential === 'boolean'
        ? transferRecord.linked_is_amount_confidential
        : undefined,
    is_origin: Boolean(transferRecord.is_origin),
  };
}

export async function loadTransactionListEnrichment({
  normalizedWsId,
  route,
  supabase,
  transactionIds,
  userId,
}: LoadTransactionListEnrichmentInput) {
  const uniqueTransactionIds = [
    ...new Set(transactionIds.filter((id) => Boolean(id))),
  ];

  if (uniqueTransactionIds.length === 0) {
    return new Map<string, TransactionListEnrichment>();
  }

  const { data, error } = await supabase.rpc(
    'get_transaction_list_enrichment',
    {
      p_ws_id: normalizedWsId,
      p_transaction_ids: uniqueTransactionIds,
      p_user_id: userId,
    }
  );

  if (error) {
    if (isRecoverableEnrichmentError(error)) {
      serverLogger.warn(
        'Transaction list enrichment unavailable; continuing without enrichment',
        {
          error,
          normalizedWsId,
          route,
          transactionCount: uniqueTransactionIds.length,
        }
      );

      return new Map<string, TransactionListEnrichment>();
    }

    throw error;
  }

  const enrichmentByTransactionId = new Map<
    string,
    TransactionListEnrichment
  >();

  for (const row of (data ?? []) as RawTransactionListEnrichmentRow[]) {
    enrichmentByTransactionId.set(row.transaction_id, {
      wallet_currency: row.wallet_currency,
      wallet_icon: row.wallet_icon,
      wallet_image_src: row.wallet_image_src,
      tags: normalizeTags(row.tags),
      transfer: normalizeTransfer(row.transfer),
    });
  }

  return enrichmentByTransactionId;
}
