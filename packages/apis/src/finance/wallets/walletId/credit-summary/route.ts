import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

/**
 * Compute the exact date for a given "day of month" in a specific year/month,
 * capping at the last day of the month if needed (e.g., day 31 in February → 28/29).
 */
function getDateForDay(year: number, month: number, day: number): Date {
  // month is 0-indexed for Date constructor
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return new Date(year, month, clampedDay);
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

interface CycleDates {
  prevCycleStart: Date;
  lastStatementClose: Date;
  nextStatementClose: Date;
  nextPaymentDue: Date;
}

function computeCycleDates(
  statementDay: number,
  paymentDay: number,
  today: Date
): CycleDates {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  // Find the most recent statement close date (lastStatementClose)
  let lastStatementClose = getDateForDay(year, month, statementDay);
  if (lastStatementClose > today) {
    // Statement hasn't happened yet this month, go back one month
    lastStatementClose = getDateForDay(year, month - 1, statementDay);
  }

  // Previous cycle start is one month before lastStatementClose
  const prevMonth = lastStatementClose.getMonth() - 1;
  const prevYear = lastStatementClose.getFullYear();
  const prevCycleStart = getDateForDay(prevYear, prevMonth, statementDay);

  // Next statement close is one month after lastStatementClose
  const nextMonth = lastStatementClose.getMonth() + 1;
  const nextYear = lastStatementClose.getFullYear();
  const nextStatementClose = getDateForDay(nextYear, nextMonth, statementDay);

  // Next payment due date
  let nextPaymentDue = getDateForDay(year, month, paymentDay);
  if (nextPaymentDue < today) {
    // Payment date has passed this month, look at next month
    nextPaymentDue = getDateForDay(year, month + 1, paymentDay);
  }

  return {
    prevCycleStart,
    lastStatementClose,
    nextStatementClose,
    nextPaymentDue,
  };
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId, wsId } = await params;
  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // 1. Fetch wallet + credit_wallets data
  const { data: walletData, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('balance, credit_wallets(limit, statement_date, payment_date)')
    .eq('id', walletId)
    .single();

  if (walletError || !walletData) {
    return NextResponse.json(
      { message: 'Error fetching wallet data' },
      { status: 500 }
    );
  }

  const creditData = (
    walletData as typeof walletData & {
      credit_wallets?: {
        limit: number;
        statement_date: number;
        payment_date: number;
      } | null;
    }
  ).credit_wallets;

  if (!creditData) {
    return NextResponse.json(
      { message: 'Not a credit wallet' },
      { status: 400 }
    );
  }

  const balance = walletData.balance ?? 0;
  const creditLimit = creditData.limit ?? 0;
  const statementDay = creditData.statement_date ?? 1;
  const paymentDay = creditData.payment_date ?? 1;

  // 2. Compute billing cycle dates
  const today = new Date();
  const {
    prevCycleStart,
    lastStatementClose,
    nextStatementClose,
    nextPaymentDue,
  } = computeCycleDates(statementDay, paymentDay, today);

  // 3. Query transactions for previous cycle and current cycle in parallel
  const [prevCycleResult, currentCycleResult] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('wallet_id', walletId)
      .gte('taken_at', formatDate(prevCycleStart))
      .lt('taken_at', formatDate(lastStatementClose)),
    supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('wallet_id', walletId)
      .gte('taken_at', formatDate(lastStatementClose))
      .lt('taken_at', formatDate(nextStatementClose)),
  ]);

  const statementBalance = (prevCycleResult.data || []).reduce(
    (sum, tx) => sum + (tx.amount ?? 0),
    0
  );

  const currentActivity = (currentCycleResult.data || []).reduce(
    (sum, tx) => sum + (tx.amount ?? 0),
    0
  );

  // 4. Compute summary values
  // For credit cards: balance is typically negative when you owe money
  // Available credit = limit - amount owed (|balance| when negative)
  const totalOutstanding = balance < 0 ? Math.abs(balance) : 0;
  const availableCredit = creditLimit - totalOutstanding;
  const utilization =
    creditLimit > 0
      ? Math.min(100, Math.round((totalOutstanding / creditLimit) * 100))
      : 0;

  const daysUntilStatement = daysBetween(today, nextStatementClose);
  const daysUntilPayment = daysBetween(today, nextPaymentDue);

  return NextResponse.json({
    limit: creditLimit,
    balance,
    availableCredit,
    totalOutstanding,
    utilization,
    statementBalance,
    currentActivity,
    nextStatementDate: formatDate(nextStatementClose),
    daysUntilStatement,
    nextPaymentDate: formatDate(nextPaymentDue),
    daysUntilPayment,
    cycleStart: formatDate(lastStatementClose),
    cycleEnd: formatDate(nextStatementClose),
    prevCycleStart: formatDate(prevCycleStart),
    prevCycleEnd: formatDate(lastStatementClose),
  });
}
