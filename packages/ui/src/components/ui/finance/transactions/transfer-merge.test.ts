import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { describe, expect, it } from 'vitest';
import { mergeLinkedTransferTransactions } from './transfer-merge';

function transaction(
  id: string,
  amount: number,
  transfer?: Transaction['transfer']
): Transaction {
  return {
    amount,
    id,
    taken_at: '2026-06-11T00:00:00.000Z',
    wallet_id: `wallet-${id}`,
    wallet: `Wallet ${id}`,
    transfer,
  };
}

const originTransfer = {
  is_origin: true,
  linked_amount: 100,
  linked_transaction_id: 'destination',
  linked_wallet_id: 'wallet-destination',
  linked_wallet_name: 'Destination Wallet',
} satisfies Transaction['transfer'];

const destinationTransfer = {
  is_origin: false,
  linked_amount: -100,
  linked_transaction_id: 'origin',
  linked_wallet_id: 'wallet-origin',
  linked_wallet_name: 'Origin Wallet',
} satisfies Transaction['transfer'];

describe('mergeLinkedTransferTransactions', () => {
  it('collapses a linked origin and destination pair into one transfer row', () => {
    const origin = transaction('origin', -100, originTransfer);
    const destination = transaction('destination', 100, destinationTransfer);

    expect(mergeLinkedTransferTransactions([origin, destination])).toEqual([
      origin,
    ]);
  });

  it('keeps the origin transfer when the destination leg appears first', () => {
    const origin = transaction('origin', -100, originTransfer);
    const destination = transaction('destination', 100, destinationTransfer);

    expect(mergeLinkedTransferTransactions([destination, origin])).toEqual([
      origin,
    ]);
  });

  it('keeps an unmatched transfer leg visible', () => {
    const destination = transaction('destination', 100, destinationTransfer);

    expect(mergeLinkedTransferTransactions([destination])).toEqual([
      destination,
    ]);
  });

  it('does not merge unrelated rows with matching amounts', () => {
    const expense = transaction('expense', -100);
    const income = transaction('income', 100);

    expect(mergeLinkedTransferTransactions([expense, income])).toEqual([
      expense,
      income,
    ]);
  });

  it('keeps unrelated row order while using the first pair slot', () => {
    const first = transaction('first', 1);
    const second = transaction('second', 2);
    const third = transaction('third', 3);
    const origin = transaction('origin', -100, originTransfer);
    const destination = transaction('destination', 100, destinationTransfer);

    expect(
      mergeLinkedTransferTransactions([
        first,
        destination,
        second,
        origin,
        third,
      ])
    ).toEqual([first, origin, second, third]);
  });
});
