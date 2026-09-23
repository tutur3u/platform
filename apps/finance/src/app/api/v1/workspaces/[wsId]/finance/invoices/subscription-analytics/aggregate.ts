import type {
  SubscriptionPaymentAnalytics,
  SubscriptionPaymentMetrics,
  SubscriptionPaymentQuery,
} from '@tuturuuu/internal-api/finance-subscription-analytics';

export interface PaidSubscriptionInvoice {
  id: string;
  customer_id: string | null;
  completed_at: string | null;
  subscription_months: string[] | null;
  valid_until: string | null;
  paid_amount: number;
  wallet_id: string;
  finance_invoice_user_groups: { user_group_id: string }[];
}

function accumulator() {
  return {
    users: new Map<string, Set<string>>(),
    groups: new Set<string>(),
    invoices: new Set<string>(),
    amount: 0,
  };
}
type Accumulator = ReturnType<typeof accumulator>;
function add(
  target: Accumulator,
  invoice: PaidSubscriptionInvoice,
  groups: Set<string>,
  amount: number
) {
  target.invoices.add(invoice.id);
  target.amount += amount;
  for (const group of groups) target.groups.add(group);
  if (invoice.customer_id) {
    const memberships =
      target.users.get(invoice.customer_id) ?? new Set<string>();
    for (const group of groups) memberships.add(group);
    target.users.set(invoice.customer_id, memberships);
  }
}
function metrics(value: Accumulator): SubscriptionPaymentMetrics {
  return {
    paidUsers: value.users.size,
    paidGroups: value.groups.size,
    memberships: [...value.users.values()].reduce(
      (sum, groups) => sum + groups.size,
      0
    ),
    invoiceCount: value.invoices.size,
    amount: Number(value.amount.toFixed(6)),
  };
}

/** Allocate paid value equally across explicit tuition months; never infer legacy starts. */
export function aggregateSubscriptionPayments(
  invoices: PaidSubscriptionInvoice[],
  walletCurrencies: Map<string, string>,
  query: SubscriptionPaymentQuery
): SubscriptionPaymentAnalytics {
  const firstYear =
    query.granularity === 'monthly' ? query.year : query.year - 4;
  const labels =
    query.granularity === 'monthly'
      ? Array.from(
          { length: 12 },
          (_, i) => `${query.year}-${String(i + 1).padStart(2, '0')}`
        )
      : Array.from({ length: 5 }, (_, i) => String(firstYear + i));
  let unallocatedInvoices = 0;
  const seen = new Set<string>();
  const currencies = new Map<
    string,
    { summary: Accumulator; periods: Map<string, Accumulator> }
  >();
  for (const invoice of invoices) {
    if (
      !invoice.completed_at ||
      !Number.isFinite(invoice.paid_amount) ||
      invoice.paid_amount <= 0
    )
      continue;
    const groups = new Set(
      invoice.finance_invoice_user_groups.map((link) => link.user_group_id)
    );
    if (groups.size === 0) continue;
    if (seen.has(invoice.id)) continue;
    seen.add(invoice.id);
    if (!invoice.subscription_months) {
      unallocatedInvoices++;
      continue;
    }
    const months = [
      ...new Set(invoice.subscription_months.map((month) => month.slice(0, 7))),
    ];
    if (
      !months.length ||
      months.length > 12 ||
      months.some((month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    )
      throw new Error('Invalid subscription coverage');
    const allocations = new Map<string, number>();
    for (const month of months) {
      const period =
        query.granularity === 'monthly' ? month : month.slice(0, 4);
      if (labels.includes(period))
        allocations.set(
          period,
          (allocations.get(period) ?? 0) + invoice.paid_amount / months.length
        );
    }
    if (!allocations.size) continue;
    const currency = walletCurrencies.get(invoice.wallet_id);
    if (!currency) throw new Error('Invoice wallet currency is unavailable');
    let bucket = currencies.get(currency);
    if (!bucket) {
      bucket = {
        summary: accumulator(),
        periods: new Map(labels.map((label) => [label, accumulator()])),
      };
      currencies.set(currency, bucket);
    }
    add(
      bucket.summary,
      invoice,
      groups,
      [...allocations.values()].reduce((sum, amount) => sum + amount, 0)
    );
    for (const [period, amount] of allocations)
      add(bucket.periods.get(period)!, invoice, groups, amount);
  }
  return {
    year: query.year,
    granularity: query.granularity,
    unallocatedInvoices,
    currencies: [...currencies]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, bucket]) => {
        const distribution = new Map<number, number>();
        for (const groups of bucket.summary.users.values())
          distribution.set(
            groups.size,
            (distribution.get(groups.size) ?? 0) + 1
          );
        return {
          currency,
          summary: metrics(bucket.summary),
          periods: [...bucket.periods].map(([period, value]) => ({
            period,
            ...metrics(value),
          })),
          distribution: [...distribution]
            .sort(([a], [b]) => a - b)
            .map(([groupCount, userCount]) => ({ groupCount, userCount })),
        };
      }),
  };
}
