import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../request-access';

const RECENT_STATS_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RelatedTransactionRow = {
  amount: number | null;
  taken_at: string | null;
} | null;

type WalletTransactionTagStatsRow = {
  transaction_id: string;
  wallet_transactions: RelatedTransactionRow | RelatedTransactionRow[];
};

type TransactionTagStatsSourceRow = {
  id: string;
  name: string;
  color: string | null;
  wallet_transaction_tags?: WalletTransactionTagStatsRow[] | null;
};

function normalizeRelatedTransaction(
  value: WalletTransactionTagStatsRow['wallet_transactions']
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getTransactionTime(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await sbAdmin
    .from('transaction_tags')
    .select(
      `
        id,
        name,
        color,
        wallet_transaction_tags(
          transaction_id,
          wallet_transactions(amount, taken_at)
        )
      `
    )
    .eq('ws_id', normalizedWsId)
    .order('name');

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching tag stats' },
      { status: 500 }
    );
  }

  const recentSince = Date.now() - RECENT_STATS_WINDOW_DAYS * MS_PER_DAY;

  const stats = ((data ?? []) as TransactionTagStatsSourceRow[]).map((tag) => {
    let expenseCount = 0;
    let incomeCount = 0;
    let lastTransactionAt: string | null = null;
    let lastTransactionTime: number | null = null;
    let netTotal = 0;
    let recentExpenseCount = 0;
    let recentIncomeCount = 0;
    let recentTotalExpense = 0;
    let recentTotalIncome = 0;
    let recentTransactionCount = 0;
    let totalExpense = 0;
    let totalIncome = 0;
    let transactionCount = 0;

    const tagLinks = Array.isArray(tag.wallet_transaction_tags)
      ? tag.wallet_transaction_tags
      : [];

    for (const tagLink of tagLinks) {
      const transaction = normalizeRelatedTransaction(
        tagLink.wallet_transactions
      );

      if (!transaction) {
        continue;
      }

      const amount = Number(transaction.amount ?? 0);
      const transactionTime = getTransactionTime(transaction.taken_at);

      transactionCount += 1;
      netTotal += amount;

      if (amount > 0) {
        incomeCount += 1;
        totalIncome += amount;
      } else if (amount < 0) {
        expenseCount += 1;
        totalExpense += Math.abs(amount);
      }

      if (
        transactionTime != null &&
        (lastTransactionTime == null || transactionTime > lastTransactionTime)
      ) {
        lastTransactionAt = transaction.taken_at;
        lastTransactionTime = transactionTime;
      }

      if (transactionTime != null && transactionTime >= recentSince) {
        recentTransactionCount += 1;

        if (amount > 0) {
          recentIncomeCount += 1;
          recentTotalIncome += amount;
        } else if (amount < 0) {
          recentExpenseCount += 1;
          recentTotalExpense += Math.abs(amount);
        }
      }
    }

    return {
      tag_id: tag.id,
      tag_name: tag.name,
      tag_color: tag.color ?? '',
      transaction_count: transactionCount,
      income_count: incomeCount,
      expense_count: expenseCount,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_total: netTotal,
      recent_transaction_count: recentTransactionCount,
      recent_income_count: recentIncomeCount,
      recent_expense_count: recentExpenseCount,
      recent_total_income: recentTotalIncome,
      recent_total_expense: recentTotalExpense,
      last_transaction_at: lastTransactionAt,
    };
  });

  return NextResponse.json(stats);
}
