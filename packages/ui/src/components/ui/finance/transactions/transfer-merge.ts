import type { Transaction } from '@tuturuuu/types/primitives/Transaction';

function getTransferPairKey(transaction: Transaction) {
  const transactionId = transaction.id;
  const linkedTransactionId = transaction.transfer?.linked_transaction_id;

  if (!transactionId || !linkedTransactionId) return null;

  return [transactionId, linkedTransactionId].sort().join(':');
}

function preferOriginTransfer(
  current: Transaction,
  candidate: Transaction
): Transaction {
  if (candidate.transfer?.is_origin && !current.transfer?.is_origin) {
    return candidate;
  }

  return current;
}

export function mergeLinkedTransferTransactions(
  transactions: Transaction[]
): Transaction[] {
  const mergedTransactions: Transaction[] = [];
  const pairSlotByKey = new Map<string, number>();

  for (const transaction of transactions) {
    const pairKey = getTransferPairKey(transaction);

    if (!pairKey) {
      mergedTransactions.push(transaction);
      continue;
    }

    const existingSlot = pairSlotByKey.get(pairKey);

    if (existingSlot === undefined) {
      pairSlotByKey.set(pairKey, mergedTransactions.length);
      mergedTransactions.push(transaction);
      continue;
    }

    mergedTransactions[existingSlot] = preferOriginTransfer(
      mergedTransactions[existingSlot]!,
      transaction
    );
  }

  return mergedTransactions;
}
