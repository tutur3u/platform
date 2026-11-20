import type { ParticipantAmount } from './allocate';
import { checkedNumber, compareId, minorUnits, sum, unsigned } from './money';

export interface SettlementTransfer {
  from: string;
  to: string;
  amountMinor: number;
}

type Transfer = Omit<SettlementTransfer, 'amountMinor'> & { amount: bigint };

export interface SettlementInput {
  /** Positive balances are receivable. Negative balances are owed. */
  balances: readonly ParticipantAmount[];
  direct?: readonly SettlementTransfer[];
  confirmed?: readonly SettlementTransfer[];
}

const MAX_EXACT_PARTICIPANTS = 12;
const MAX_TRANSITIONS = 100_000;

function pairKey(from: string, to: string) {
  return JSON.stringify([from, to]);
}

function groupTransfers(
  transfers: readonly SettlementTransfer[],
  participants: ReadonlyMap<string, bigint>
) {
  const grouped = new Map<string, Transfer>();
  for (const { from, to, amountMinor } of transfers) {
    const amount = unsigned(amountMinor);
    if (
      from === to ||
      !participants.has(from) ||
      !participants.has(to) ||
      amount === 0n
    ) {
      throw new RangeError('Invalid transfer endpoints or amount');
    }
    const key = pairKey(from, to);
    grouped.set(key, {
      from,
      to,
      amount: amount + (grouped.get(key)?.amount ?? 0n),
    });
  }
  return grouped;
}

function minimum(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function applyTransfer(
  balances: Map<string, bigint>,
  { from, to, amount }: Transfer
) {
  balances.set(from, balances.get(from)! + amount);
  balances.set(to, balances.get(to)! - amount);
}

interface Step {
  from: number;
  to: number;
  amount: bigint;
}

interface Continuation {
  cost: number;
  step?: Step;
}

function advance(balances: readonly bigint[], { from, to, amount }: Step) {
  const next = balances.slice();
  next[from] = next[from]! + amount;
  next[to] = next[to]! - amount;
  return next;
}

function greedy(balances: readonly bigint[]) {
  const steps: Step[] = [];
  for (let from = 0, to = 0; from < balances.length && to < balances.length;) {
    if (balances[from]! >= 0n) {
      from++;
      continue;
    }
    if (balances[to]! <= 0n) {
      to++;
      continue;
    }

    const step = { from, to, amount: minimum(-balances[from]!, balances[to]!) };
    steps.push(step);
    balances = advance(balances, step);
  }
  return steps;
}

function optimal(
  opening: readonly bigint[],
  reserved: readonly (readonly boolean[])[]
): Step[] | undefined {
  const memo = new Map<string, Continuation>();
  let transitions = 0;
  const exhausted = new Error('Settlement search limit');

  function solve(balances: readonly bigint[]): Continuation {
    const key = balances.join(',');
    const known = memo.get(key);
    if (known) return known;

    const debtors: number[] = [];
    const creditors: number[] = [];
    balances.forEach((balance, index) => {
      if (balance < 0n) debtors.push(index);
      if (balance > 0n) creditors.push(index);
    });
    if (debtors.length === 0) return { cost: 0 };

    // An endpoint with no reusable direct pair needs at least one new edge.
    const lowerBound = Math.max(
      debtors.filter((from) => !creditors.some((to) => reserved[from]?.[to]))
        .length,
      creditors.filter((to) => !debtors.some((from) => reserved[from]?.[to]))
        .length
    );
    let best: Continuation = { cost: Infinity };

    search: for (const from of debtors) {
      for (const to of creditors) {
        if (++transitions > MAX_TRANSITIONS) throw exhausted;
        const edgeCost = reserved[from]?.[to] ? 0 : 1;
        if (edgeCost >= best.cost) continue;
        const step = {
          from,
          to,
          amount: minimum(-balances[from]!, balances[to]!),
        };
        const cost = edgeCost + solve(advance(balances, step)).cost;
        if (cost < best.cost) best = { cost, step };
        if (best.cost === lowerBound) break search;
      }
    }

    memo.set(key, best);
    return best;
  }

  try {
    const steps: Step[] = [];
    let balances = opening;
    for (let step = solve(balances).step; step; step = solve(balances).step) {
      steps.push(step);
      balances = advance(balances, step);
    }
    return steps;
  } catch (error) {
    if (error !== exhausted) throw error;
    return undefined;
  }
}

export function planSettlement(input: SettlementInput): {
  optimal: boolean;
  transfers: SettlementTransfer[];
} {
  const balances = new Map<string, bigint>();
  for (const { participantId, amountMinor } of input.balances) {
    if (!participantId || balances.has(participantId)) {
      throw new RangeError('Participant IDs must be nonempty and unique');
    }
    balances.set(participantId, minorUnits(amountMinor));
  }
  if (sum(balances.values()) !== 0n)
    throw new RangeError('Ledger must balance');

  const confirmed = groupTransfers(input.confirmed ?? [], balances);
  const direct = groupTransfers(input.direct ?? [], balances);
  const transfers = new Map<string, Transfer>();
  for (const payment of confirmed.values()) applyTransfer(balances, payment);
  for (const [key, obligation] of direct) {
    const amount = obligation.amount - (confirmed.get(key)?.amount ?? 0n);
    if (amount <= 0n) continue;
    const remaining = { ...obligation, amount };
    transfers.set(key, remaining);
    applyTransfer(balances, remaining);
  }

  const participants = Array.from(balances.keys())
    .filter((id) => balances.get(id) !== 0n)
    .sort(compareId);
  const opening = participants.map((id) => balances.get(id)!);
  const exact =
    opening.length <= MAX_EXACT_PARTICIPANTS
      ? optimal(
          opening,
          participants.map((from) =>
            participants.map((to) => transfers.has(pairKey(from, to)))
          )
        )
      : undefined;

  for (const step of exact ?? greedy(opening)) {
    const from = participants[step.from]!;
    const to = participants[step.to]!;
    const key = pairKey(from, to);
    transfers.set(key, {
      from,
      to,
      amount: step.amount + (transfers.get(key)?.amount ?? 0n),
    });
  }

  return {
    optimal: exact !== undefined,
    transfers: Array.from(transfers.values(), ({ from, to, amount }) => ({
      from,
      to,
      amountMinor: checkedNumber(amount),
    })).sort(
      (left, right) =>
        compareId(left.from, right.from) || compareId(left.to, right.to)
    ),
  };
}
