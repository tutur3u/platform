import { getFinanceMinorUnitFactor } from '@tuturuuu/utils/finance-money';
import { parseSplitAmount } from './amount';

export type DraftPerson = { id: string; label: string };
type Mode = 'equal' | 'percentage' | 'exact';

export type DraftLine = {
  id: string;
  label: string;
  amount: string;
  mode: Mode;
  excluded: string[];
  shares: Record<string, string>;
};

export type DraftSponsor = {
  id: string;
  from: string;
  to: string;
  amount: string;
};

export type DraftExpense = {
  id: string;
  label: string;
  currency: string;
  rate: string;
  lines: DraftLine[];
  adjustments: Record<'tax' | 'tip' | 'discount', string>;
  payments: Record<string, string>;
  sponsors: DraftSponsor[];
};

export function emptyLine(): DraftLine {
  return {
    id: crypto.randomUUID(),
    label: '',
    amount: '',
    mode: 'equal',
    excluded: [],
    shares: {},
  };
}

export function emptyExpense(currency: string): DraftExpense {
  return {
    id: crypto.randomUUID(),
    label: '',
    currency,
    rate: '',
    lines: [emptyLine()],
    adjustments: { tax: '', tip: '', discount: '' },
    payments: {},
    sponsors: [],
  };
}

export function emptySponsor(): DraftSponsor {
  return { id: crypto.randomUUID(), from: '', to: '', amount: '' };
}

export function currencyValue(code: string) {
  return { code, minorDigits: Math.log10(getFinanceMinorUnitFactor(code)) };
}

function asRate(input: string) {
  const precision = input.trim().split(/[.,]/u)[1]?.length ?? 0;
  const fraction = Math.min(precision, 8);
  return {
    numerator: parseSplitAmount(input, fraction),
    denominator: 10 ** fraction,
  };
}

export function buildExpense(
  expense: DraftExpense,
  people: readonly DraftPerson[],
  settlementCurrency: string
) {
  const currency = currencyValue(expense.currency);
  const minor = (value: string) =>
    parseSplitAmount(value, currency.minorDigits);
  const attendees = new Set<string>();
  const lines = expense.lines.map((line) => {
    const included = people.filter(
      (person) => !line.excluded.includes(person.id)
    );
    for (const person of included) attendees.add(person.id);

    const allocation =
      line.mode === 'equal'
        ? {
            kind: line.mode,
            participantIds: included.map((person) => person.id),
          }
        : line.mode === 'percentage'
          ? {
              kind: line.mode,
              shares: included.map((person) => ({
                participantId: person.id,
                basisPoints: parseSplitAmount(line.shares[person.id] ?? '', 2),
              })),
            }
          : {
              kind: line.mode,
              shares: included.map((person) => ({
                participantId: person.id,
                amountMinor: minor(line.shares[person.id] ?? ''),
              })),
            };

    return {
      label: line.label || expense.label,
      amountMinor: minor(line.amount),
      allocation,
    };
  });

  return {
    label: expense.label,
    currency,
    ...(expense.currency !== settlementCurrency
      ? { exchangeRate: asRate(expense.rate) }
      : {}),
    attendeeIds: [...attendees],
    lines,
    adjustments: (['tax', 'tip', 'discount'] as const).flatMap((kind) => {
      const value = expense.adjustments[kind].trim();
      return value ? [{ kind, amountMinor: minor(value) }] : [];
    }),
    payments: people.flatMap(({ id: participantId }) => {
      const value = expense.payments[participantId]?.trim();
      return value ? [{ participantId, amountMinor: minor(value) }] : [];
    }),
    sponsorships: expense.sponsors.map(({ from, to, amount }) => ({
      sponsorId: from,
      beneficiaryId: to,
      ...(amount.trim()
        ? { kind: 'partial', amountMinor: minor(amount) }
        : { kind: 'full' }),
    })),
  };
}

export function buildDirectPayments(
  rows: readonly DraftSponsor[],
  currency: string
) {
  const { minorDigits } = currencyValue(currency);
  return rows.map(({ from, to, amount }) => ({
    from,
    to,
    amountMinor: parseSplitAmount(amount, minorDigits),
  }));
}
