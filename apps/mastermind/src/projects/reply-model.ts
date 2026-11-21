import type { ReplyReceipt, ThreadErrorCode, ThreadResult } from './contract';

/** One reply the owner sent from this page, keyed by its idempotency key. */
export type Outgoing = {
  key: string;
  text: string;
  status:
    | { kind: 'sending' }
    | { kind: 'receipt'; receipt: ReplyReceipt }
    | { kind: 'error'; code: ThreadErrorCode };
};

export type DeliveryLabel =
  | 'sending'
  | 'sent'
  | 'steered'
  | 'started'
  | 'queued'
  | 'failed'
  | 'expired';

/** The receipt line's words, from the verified receipt only. */
export function deliveryLabel(
  status: Outgoing['status']
): DeliveryLabel | undefined {
  if (status.kind === 'sending') return 'sending';
  if (status.kind === 'error') return undefined;
  const { receipt } = status;
  if (receipt.state === 'delivered') return receipt.delivery ?? 'steered';
  if (receipt.state === 'sent') return 'sent';
  return receipt.state;
}

/** Steps filled on the two-segment track: sending, sent, then delivered. */
export function deliverySteps(label: DeliveryLabel | undefined) {
  if (label === 'sending' || label === undefined) return 0;
  if (label === 'sent' || label === 'failed' || label === 'expired') return 1;
  return 2;
}

/** Folds a send or receipt read into the outgoing list. */
export function settle(
  list: readonly Outgoing[],
  key: string,
  result: ThreadResult<ReplyReceipt>
): Outgoing[] {
  return list.map((item) =>
    item.key === key
      ? {
          ...item,
          status:
            result.kind === 'ok'
              ? { kind: 'receipt', receipt: result.data }
              : { kind: 'error', code: result.code },
        }
      : item
  );
}

/** A reply still waiting on its machine; its receipt is read on a socket notice. */
export function pendingReceiptKey(item: Outgoing, receiptId: string) {
  return item.status.kind === 'receipt' &&
    item.status.receipt.state === 'sent' &&
    item.status.receipt.id === receiptId
    ? item.key
    : undefined;
}
