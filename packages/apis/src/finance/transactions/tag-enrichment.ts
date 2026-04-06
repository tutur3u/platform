import type { TypedSupabaseClient } from '@tuturuuu/supabase';

type TransactionRow = {
  id: string;
  tags?: unknown;
};

type EnrichedTransactionTag = {
  id: string;
  name: string;
  color: string | null;
};

type RawRelatedTag = {
  id: string;
  name: string;
  color: string | null;
} | null;

type WalletTransactionTagRow = {
  transaction_id: string;
  transaction_tags: RawRelatedTag | RawRelatedTag[];
};

function normalizeRelatedTags(
  rawTags: WalletTransactionTagRow['transaction_tags']
): EnrichedTransactionTag[] {
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];

  return tags
    .filter(
      (tag): tag is NonNullable<RawRelatedTag> =>
        tag != null &&
        typeof tag.id === 'string' &&
        typeof tag.name === 'string'
    )
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color ?? null,
    }));
}

export async function enrichTransactionsWithTags<
  TTransaction extends TransactionRow,
>(
  sbAdmin: TypedSupabaseClient,
  transactions: TTransaction[]
): Promise<{
  data: Array<TTransaction & { tags: EnrichedTransactionTag[] }> | null;
  error: { message: string } | null;
}> {
  const transactionIds = [
    ...new Set(transactions.map((transaction) => transaction.id)),
  ];

  if (transactionIds.length === 0) {
    return {
      data: transactions.map((transaction) => ({
        ...transaction,
        tags: [],
      })),
      error: null,
    };
  }

  const { data, error } = await sbAdmin
    .from('wallet_transaction_tags')
    .select('transaction_id, transaction_tags(id, name, color)')
    .in('transaction_id', transactionIds);

  if (error) {
    return {
      data: null,
      error: {
        message: error.message,
      },
    };
  }

  const tagsByTransactionId = new Map<string, EnrichedTransactionTag[]>();

  for (const row of (data ?? []) as WalletTransactionTagRow[]) {
    const relatedTags = normalizeRelatedTags(row.transaction_tags);
    if (relatedTags.length === 0) {
      continue;
    }

    const existing = tagsByTransactionId.get(row.transaction_id) ?? [];
    tagsByTransactionId.set(row.transaction_id, [...existing, ...relatedTags]);
  }

  return {
    data: transactions.map((transaction) => ({
      ...transaction,
      tags: tagsByTransactionId.get(transaction.id) ?? [],
    })),
    error: null,
  };
}
