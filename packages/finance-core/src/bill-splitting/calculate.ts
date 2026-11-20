import { allocateExpense, type Currency, type Expense } from './allocate';
import { addAmount, checkedNumber, compareId } from './money';
import { planSettlement, type SettlementTransfer } from './settle';

export interface BillSplitCalculation {
  participantIds: readonly string[];
  currency: Currency;
  expenses: readonly Omit<Expense, 'participantIds' | 'settlementCurrency'>[];
  direct?: readonly SettlementTransfer[];
  confirmed?: readonly SettlementTransfer[];
}

export function calculateBillSplit({
  currency,
  participantIds,
  expenses,
  direct,
  confirmed,
}: BillSplitCalculation) {
  if (expenses.length === 0) throw new RangeError('A split needs an expense');

  const balances = new Map(participantIds.map((id) => [id, 0n]));
  let total = 0n;
  const allocations = expenses.map((expense) => {
    const result = allocateExpense({
      ...expense,
      participantIds,
      settlementCurrency: currency,
    });

    total += BigInt(result.settlementTotalMinor);
    for (const credit of result.credits) {
      addAmount(balances, credit.participantId, BigInt(credit.amountMinor));
    }
    for (const share of result.shares) {
      addAmount(balances, share.participantId, -BigInt(share.amountMinor));
    }
    return result;
  });

  const net = Array.from(balances, ([participantId, amount]) => ({
    participantId,
    amountMinor: checkedNumber(amount),
  })).sort((left, right) => compareId(left.participantId, right.participantId));

  return {
    allocations,
    balances: net,
    settlement: planSettlement({ balances: net, direct, confirmed }),
    totalMinor: checkedNumber(total),
  };
}
