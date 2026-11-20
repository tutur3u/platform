import {
  addAmount,
  checkedNumber,
  compareId,
  distribute,
  sum,
  unsigned,
} from './money';

export interface ParticipantAmount {
  participantId: string;
  amountMinor: number;
}

export type Allocation =
  | { kind: 'equal'; participantIds: readonly string[] }
  | {
      kind: 'percentage';
      shares: readonly { participantId: string; basisPoints: number }[];
    }
  | { kind: 'exact'; shares: readonly ParticipantAmount[] };

export interface ExpenseLine {
  amountMinor: number;
  allocation: Allocation;
}

export interface ExpenseAdjustment {
  kind: 'tax' | 'tip' | 'discount';
  amountMinor: number;
  allocation?: Allocation;
}

export type Sponsorship = { sponsorId: string; beneficiaryId: string } & (
  | { kind: 'full' }
  | { kind: 'partial'; amountMinor: number }
);

export interface Currency {
  code: string;
  minorDigits: number;
}

export interface Expense {
  currency: Currency;
  settlementCurrency: Currency;
  /** Major settlement units per major expense unit. */
  exchangeRate?: { numerator: number; denominator: number };
  participantIds: readonly string[];
  attendeeIds: readonly string[];
  lines: readonly ExpenseLine[];
  adjustments?: readonly ExpenseAdjustment[];
  sponsorships?: readonly Sponsorship[];
  payments: readonly ParticipantAmount[];
}

function participantSet(ids: readonly string[]) {
  const members = new Set(ids);
  if (members.size !== ids.length || members.has('')) {
    throw new RangeError('Participant IDs must be nonempty and unique');
  }
  return members;
}

function amountMap(
  entries: readonly ParticipantAmount[],
  admitted: ReadonlySet<string>
) {
  const amounts = new Map<string, bigint>();
  for (const { participantId, amountMinor } of entries) {
    if (!admitted.has(participantId) || amounts.has(participantId)) {
      throw new RangeError(
        'Allocation contains an invalid or duplicate participant'
      );
    }
    amounts.set(participantId, unsigned(amountMinor));
  }
  return amounts;
}

function allocate(
  amount: bigint,
  rule: Allocation,
  attendees: ReadonlySet<string>
) {
  const weights = amountMap(
    rule.kind === 'equal'
      ? rule.participantIds.map((participantId) => ({
          participantId,
          amountMinor: 1,
        }))
      : rule.kind === 'percentage'
        ? rule.shares.map(({ participantId, basisPoints }) => ({
            participantId,
            amountMinor: basisPoints,
          }))
        : rule.shares,
    attendees
  );

  if (rule.kind === 'exact') {
    if (sum(weights.values()) !== amount) {
      throw new RangeError('Exact shares must sum to the amount');
    }
    return weights;
  }
  if (rule.kind === 'percentage' && sum(weights.values()) !== 10_000n) {
    throw new RangeError('Percentage shares must sum to 100 percent');
  }
  return distribute(amount, weights);
}

function currencyScale(currency: Currency) {
  if (
    !/^[A-Z]{3}$/.test(currency.code) ||
    !Number.isInteger(currency.minorDigits) ||
    currency.minorDigits < 0 ||
    currency.minorDigits > 4
  ) {
    throw new RangeError('Invalid currency or minor-unit scale');
  }
  return 10n ** BigInt(currency.minorDigits);
}

function convertTotal(total: bigint, expense: Expense) {
  const sourceScale = currencyScale(expense.currency);
  const targetScale = currencyScale(expense.settlementCurrency);
  if (expense.currency.code === expense.settlementCurrency.code) {
    if (sourceScale !== targetScale || expense.exchangeRate) {
      throw new RangeError(
        'Identical currencies must have the same scale and no exchange rate'
      );
    }
    return total;
  }

  const rate = expense.exchangeRate;
  if (!rate) throw new RangeError('A foreign currency requires a pinned rate');
  const numerator = unsigned(rate.numerator) * targetScale;
  const denominator = unsigned(rate.denominator) * sourceScale;
  if (numerator === 0n || denominator === 0n) {
    throw new RangeError('The exchange rate must be positive');
  }

  return (2n * total * numerator + denominator) / (2n * denominator);
}

function applySponsorships(
  shares: Map<string, bigint>,
  sponsorships: readonly Sponsorship[],
  participants: ReadonlySet<string>
) {
  const eligible = new Map(shares);
  for (const sponsorship of sponsorships) {
    const { sponsorId, beneficiaryId } = sponsorship;
    const remaining = eligible.get(beneficiaryId);
    if (
      sponsorId === beneficiaryId ||
      !participants.has(sponsorId) ||
      remaining === undefined ||
      remaining === 0n
    ) {
      throw new RangeError(
        'Invalid sponsorship participants or remaining share'
      );
    }

    const amount =
      sponsorship.kind === 'full'
        ? remaining
        : unsigned(sponsorship.amountMinor);
    if (amount === 0n || amount > remaining) {
      throw new RangeError('Sponsorship exceeds the eligible share or is zero');
    }

    eligible.set(beneficiaryId, remaining - amount);
    addAmount(shares, beneficiaryId, -amount);
    addAmount(shares, sponsorId, amount);
  }
}

function displayAmounts(
  amounts: ReadonlyMap<string, bigint>
): ParticipantAmount[] {
  return Array.from(amounts, ([participantId, amount]) => ({
    participantId,
    amountMinor: checkedNumber(amount),
  })).sort((left, right) => compareId(left.participantId, right.participantId));
}

/** Allocate one expense, reconciling both sides to the same converted total. */
export function allocateExpense(expense: Expense) {
  const participants = participantSet(expense.participantIds);
  const attendees = participantSet(expense.attendeeIds);
  for (const id of attendees) {
    if (!participants.has(id)) throw new RangeError('Unknown expense attendee');
  }
  if (expense.lines.length === 0) throw new RangeError('Expense needs a line');

  const subtotal = new Map<string, bigint>();
  for (const line of expense.lines) {
    for (const [id, amount] of allocate(
      unsigned(line.amountMinor),
      line.allocation,
      attendees
    )) {
      addAmount(subtotal, id, amount);
    }
  }

  const shares = new Map(subtotal);
  for (const adjustment of expense.adjustments ?? []) {
    const amount = unsigned(adjustment.amountMinor);
    const adjustmentShares = adjustment.allocation
      ? allocate(amount, adjustment.allocation, attendees)
      : distribute(amount, subtotal);
    const sign = adjustment.kind === 'discount' ? -1n : 1n;
    for (const [id, share] of adjustmentShares)
      addAmount(shares, id, sign * share);
  }
  if (Array.from(shares.values()).some((amount) => amount < 0n)) {
    throw new RangeError('Adjustments leave a negative share');
  }

  applySponsorships(shares, expense.sponsorships ?? [], participants);
  const total = sum(shares.values());
  const payments = amountMap(expense.payments, participants);
  if (sum(payments.values()) !== total) {
    throw new RangeError('Payer credits must sum to the expense total');
  }

  const convertedTotal = convertTotal(total, expense);
  return {
    originalTotalMinor: checkedNumber(total),
    settlementTotalMinor: checkedNumber(convertedTotal),
    originalShares: displayAmounts(shares),
    shares: displayAmounts(distribute(convertedTotal, shares)),
    credits: displayAmounts(distribute(convertedTotal, payments)),
  };
}
