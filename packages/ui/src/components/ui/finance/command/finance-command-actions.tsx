import {
  ArrowLeftRight,
  Calculator,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  History,
  Repeat,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from '@tuturuuu/icons';
import type { ComponentType, ReactNode } from 'react';

type IconComponent = ComponentType<{ className?: string }>;
type Translation = (key: any) => string;

export interface FinanceCommandActionPermissions {
  canCreateDebts?: boolean;
  canCreateInvoices?: boolean;
  canCreateRecurringTransactions?: boolean;
  canCreateTransactions?: boolean;
  canCreateWallets?: boolean;
  canExportFinanceData?: boolean;
  canManageFinance?: boolean;
  canUpdateWallets?: boolean;
}

export interface FinanceCommandAction {
  description?: string;
  href: string;
  icon: IconComponent;
  id: string;
  title: string;
}

export interface FinanceCommandActionGroup {
  heading: string;
  id: 'create' | 'tools';
  items: FinanceCommandAction[];
}

function iconNode(Icon: IconComponent): ReactNode {
  return <Icon className="h-4 w-4" />;
}

export function renderFinanceCommandActionIcon(action: FinanceCommandAction) {
  return iconNode(action.icon);
}

export function buildFinanceCommandActionGroups({
  permissions,
  tCommand,
  tFinance,
}: {
  permissions: FinanceCommandActionPermissions;
  tCommand: Translation;
  tFinance: Translation;
}): FinanceCommandActionGroup[] {
  const canCreateTransactions = permissions.canCreateTransactions ?? true;
  const canCreateWallets = permissions.canCreateWallets ?? true;
  const canManageFinance = permissions.canManageFinance ?? true;
  const canCreateInvoices = permissions.canCreateInvoices ?? true;
  const canCreateDebts = permissions.canCreateDebts ?? true;
  const canCreateRecurringTransactions =
    permissions.canCreateRecurringTransactions ?? true;

  const groups: FinanceCommandActionGroup[] = [
    {
      heading: tCommand('create_group'),
      id: 'create',
      items: [
        canCreateTransactions && {
          description: tCommand('new_transaction_description'),
          href: '/transactions?create=transaction',
          icon: DollarSign,
          id: 'new-transaction',
          title: tFinance('new_transaction'),
        },
        canCreateTransactions && {
          description: tCommand('new_transfer_description'),
          href: '/transactions?create=transfer',
          icon: ArrowLeftRight,
          id: 'new-transfer',
          title: tFinance('new_transfer'),
        },
        canCreateRecurringTransactions && {
          description: tCommand('new_recurring_transaction_description'),
          href: '/recurring?create=recurring',
          icon: Repeat,
          id: 'new-recurring-transaction',
          title: tFinance('new_recurring_transaction'),
        },
        canCreateWallets && {
          description: tCommand('new_wallet_description'),
          href: '/wallets?create=wallet',
          icon: Wallet,
          id: 'new-wallet',
          title: tFinance('new_wallet'),
        },
        canCreateWallets && {
          description: tCommand('new_credit_card_description'),
          href: '/wallets?create=credit-card',
          icon: CreditCard,
          id: 'new-credit-card',
          title: tFinance('new_credit_card'),
        },
        canManageFinance && {
          description: tCommand('new_budget_description'),
          href: '/budgets?create=budget',
          icon: Target,
          id: 'new-budget',
          title: tFinance('new_budget'),
        },
        canCreateInvoices && {
          description: tCommand('new_invoice_description'),
          href: '/invoices/new',
          icon: FileText,
          id: 'new-invoice',
          title: tFinance('new_invoice'),
        },
        canCreateDebts && {
          description: tCommand('new_debt_description'),
          href: '/debts?create=debt',
          icon: TrendingDown,
          id: 'new-debt',
          title: tFinance('new_debt'),
        },
        canCreateDebts && {
          description: tCommand('new_loan_description'),
          href: '/debts?create=loan',
          icon: TrendingUp,
          id: 'new-loan',
          title: tFinance('new_loan'),
        },
        canManageFinance && {
          description: tCommand('new_category_description'),
          href: '/categories?create=category',
          icon: CreditCard,
          id: 'new-category',
          title: tCommand('new_category'),
        },
        canManageFinance && {
          description: tCommand('new_tag_description'),
          href: '/categories?tab=tags&create=tag',
          icon: Tag,
          id: 'new-tag',
          title: tCommand('new_tag'),
        },
      ].filter(Boolean) as FinanceCommandAction[],
    },
    {
      heading: tCommand('tools_group'),
      id: 'tools',
      items: [
        canCreateTransactions && {
          description: tCommand('import_transactions_description'),
          href: '/transactions?tool=import',
          icon: Download,
          id: 'import-transactions',
          title: tCommand('import_transactions'),
        },
        permissions.canExportFinanceData && {
          description: tCommand('export_transactions_description'),
          href: '/transactions?tool=export',
          icon: Upload,
          id: 'export-transactions',
          title: tCommand('export_transactions'),
        },
        permissions.canUpdateWallets && {
          description: tCommand('all_wallet_check_description'),
          href: '/wallets?tool=all-wallet-check',
          icon: Calculator,
          id: 'all-wallet-check',
          title: tCommand('all_wallet_check'),
        },
        canCreateTransactions && {
          description: tCommand('checkpoint_history_description'),
          href: '/wallets?tool=checkpoint-history',
          icon: History,
          id: 'checkpoint-history',
          title: tCommand('checkpoint_history'),
        },
        canManageFinance && {
          description: tCommand('manage_categories_description'),
          href: '/categories',
          icon: CreditCard,
          id: 'manage-categories',
          title: tFinance('manage_categories'),
        },
      ].filter(Boolean) as FinanceCommandAction[],
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}
