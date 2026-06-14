'use client';

import {
  CreditCard,
  DollarSign,
  FileText,
  Repeat,
  Tag,
  Target,
  TrendingDown,
  Wallet as WalletIcon,
} from '@tuturuuu/icons';
import type {
  RecurringTransactionRecord,
  TransactionTagRecord,
} from '@tuturuuu/internal-api/finance';
import type { FinanceBudget } from '@tuturuuu/types';
import type { DebtLoanWithBalance } from '@tuturuuu/types/primitives/DebtLoan';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import type { QuickCommandCenterGroup } from '@tuturuuu/ui/quick-command-center';
import { formatCurrency } from '@tuturuuu/utils/format';

type Translation = (key: any) => string;

interface FinanceRecentCommandGroupsOptions {
  budgets?: FinanceBudget[];
  categories?: TransactionCategoryWithStats[];
  currency: string;
  debts?: DebtLoanWithBalance[];
  invoices?: Invoice[];
  locale: string;
  pushFinanceHref: (path: string) => void;
  recurring?: RecurringTransactionRecord[];
  search: string;
  tags?: TransactionTagRecord[];
  tCommand: Translation;
  tFinance: Translation;
  transactions?: Transaction[];
  wallets?: Wallet[];
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function matchesQuery(
  value: string | null | undefined,
  query: string | null | undefined
) {
  if (!query) return true;
  return (value ?? '').toLowerCase().includes(query.toLowerCase());
}

export function buildFinanceRecentCommandGroups({
  budgets,
  categories,
  currency,
  debts,
  invoices,
  locale,
  pushFinanceHref,
  recurring,
  search,
  tags,
  tCommand,
  tFinance,
  transactions,
  wallets,
}: FinanceRecentCommandGroupsOptions): QuickCommandCenterGroup[] {
  const groups: QuickCommandCenterGroup[] = [];
  const txItems = (transactions ?? [])
    .filter((transaction) => !!transaction.id)
    .map((transaction) => {
      const amount =
        typeof transaction.amount === 'number'
          ? formatCurrency(
              transaction.amount,
              transaction.wallet_currency ?? currency,
              locale,
              { signDisplay: 'always' }
            )
          : null;
      return {
        description: [
          amount,
          transaction.wallet_name,
          formatDate(transaction.taken_at, locale),
        ]
          .filter(Boolean)
          .join(' · '),
        icon: <DollarSign className="h-4 w-4" />,
        id: `transaction-${transaction.id}`,
        onSelect: () => pushFinanceHref(`/transactions/${transaction.id}`),
        title:
          transaction.description ||
          transaction.category_name ||
          tCommand('transaction_fallback'),
      };
    });

  if (txItems.length > 0) {
    groups.push({
      heading: tCommand('recent_transactions'),
      id: 'recent-transactions',
      items: txItems,
    });
  }

  const walletItems = (wallets ?? []).map((wallet) => ({
    description: [wallet.type, wallet.currency].filter(Boolean).join(' · '),
    icon: <WalletIcon className="h-4 w-4" />,
    id: `wallet-${wallet.id}`,
    onSelect: () => pushFinanceHref(`/wallets/${wallet.id}`),
    title: wallet.name || tCommand('wallet_fallback'),
  }));

  if (walletItems.length > 0) {
    groups.push({
      heading: tCommand('recent_wallets'),
      id: 'recent-wallets',
      items: walletItems,
    });
  }

  const invoiceItems = (invoices ?? []).map((invoice) => ({
    description: [
      invoice.customer?.full_name || invoice.customer?.display_name,
      typeof invoice.price === 'number'
        ? formatCurrency(invoice.price, currency, locale)
        : null,
      formatDate(invoice.created_at, locale),
    ]
      .filter(Boolean)
      .join(' · '),
    icon: <FileText className="h-4 w-4" />,
    id: `invoice-${invoice.id}`,
    onSelect: () => pushFinanceHref(`/invoices/${invoice.id}`),
    title:
      invoice.notice ||
      invoice.note ||
      `${tCommand('invoice_fallback')} ${invoice.id.slice(0, 8)}`,
  }));

  if (invoiceItems.length > 0) {
    groups.push({
      heading: tCommand('recent_invoices'),
      id: 'recent-invoices',
      items: invoiceItems,
    });
  }

  const budgetItems = (budgets ?? [])
    .filter((budget) => matchesQuery(budget.name, search))
    .slice(0, 5)
    .map((budget) => ({
      description:
        typeof budget.amount === 'number'
          ? formatCurrency(budget.amount, currency, locale)
          : undefined,
      icon: <Target className="h-4 w-4" />,
      id: `budget-${budget.id}`,
      onSelect: () => pushFinanceHref('/budgets'),
      title: budget.name,
    }));

  if (budgetItems.length > 0) {
    groups.push({
      heading: tCommand('recent_budgets'),
      id: 'recent-budgets',
      items: budgetItems,
    });
  }

  const recurringItems = (recurring ?? [])
    .filter((item) => matchesQuery(item.name, search))
    .slice(0, 5)
    .map((item) => ({
      description: item.frequency,
      icon: <Repeat className="h-4 w-4" />,
      id: `recurring-${item.id}`,
      onSelect: () => pushFinanceHref('/recurring'),
      title: item.name,
    }));

  if (recurringItems.length > 0) {
    groups.push({
      heading: tCommand('recent_recurring'),
      id: 'recent-recurring',
      items: recurringItems,
    });
  }

  const debtItems = (debts ?? [])
    .filter((item) => matchesQuery(item.name, search))
    .slice(0, 5)
    .map((item) => ({
      description: item.type,
      icon: <TrendingDown className="h-4 w-4" />,
      id: `debt-${item.id}`,
      onSelect: () => pushFinanceHref(`/debts/${item.id}`),
      title: item.name,
    }));

  if (debtItems.length > 0) {
    groups.push({
      heading: tCommand('recent_debts'),
      id: 'recent-debts',
      items: debtItems,
    });
  }

  const categoryItems = (categories ?? [])
    .filter((item) => matchesQuery(item.name, search))
    .slice(0, 5)
    .map((item) => ({
      description:
        item.is_expense === false ? tFinance('income') : tFinance('expense'),
      icon: <CreditCard className="h-4 w-4" />,
      id: `category-${item.id}`,
      onSelect: () => pushFinanceHref('/categories'),
      title: item.name ?? tCommand('category_fallback'),
    }));

  if (categoryItems.length > 0) {
    groups.push({
      heading: tCommand('recent_categories'),
      id: 'recent-categories',
      items: categoryItems,
    });
  }

  const tagItems = (tags ?? [])
    .filter((item) => matchesQuery(item.name, search))
    .slice(0, 5)
    .map((item) => ({
      description: item.description ?? undefined,
      icon: <Tag className="h-4 w-4" />,
      id: `tag-${item.id}`,
      onSelect: () => pushFinanceHref(`/transactions?tagIds=${item.id}`),
      title: item.name,
    }));

  if (tagItems.length > 0) {
    groups.push({
      heading: tCommand('recent_tags'),
      id: 'recent-tags',
      items: tagItems,
    });
  }

  return groups;
}
