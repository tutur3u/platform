'use client';

import {
  CreditCard,
  DollarSign,
  FileText,
  Plus,
  Repeat,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFinanceHref } from '../finance-route-context';

interface QuickActionsProps {
  wsId: string;
  canCreateDebts?: boolean;
  canCreateInvoices?: boolean;
  canCreateRecurringTransactions?: boolean;
  canCreateTransactions?: boolean;
  canCreateWallets?: boolean;
  canManageFinance?: boolean;
}

export function QuickActions({
  wsId,
  canCreateDebts = true,
  canCreateInvoices = true,
  canCreateRecurringTransactions = true,
  canCreateTransactions = true,
  canCreateWallets = true,
  canManageFinance = true,
}: QuickActionsProps) {
  const router = useRouter();
  const t = useTranslations('finance');
  const financeHref = useFinanceHref();
  const hasVisibleActions =
    canCreateDebts ||
    canCreateRecurringTransactions ||
    canCreateTransactions ||
    canCreateWallets ||
    canManageFinance ||
    canCreateInvoices;

  if (!hasVisibleActions) return null;

  const pushFinanceHref = (path: string) => {
    router.push(`/${wsId}${financeHref(path)}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          className="fixed right-6 bottom-6 z-50 h-14 w-14 rounded-full p-0 shadow-lg"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">{t('quick_actions')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('quick_actions')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canCreateTransactions && (
          <DropdownMenuItem
            onClick={() => pushFinanceHref('/transactions?create=transaction')}
          >
            <DollarSign className="mr-2 h-4 w-4" />
            <span>{t('new_transaction')}</span>
          </DropdownMenuItem>
        )}
        {canCreateRecurringTransactions && (
          <DropdownMenuItem
            onClick={() => pushFinanceHref('/recurring?create=recurring')}
          >
            <Repeat className="mr-2 h-4 w-4" />
            <span>{t('new_recurring_transaction')}</span>
          </DropdownMenuItem>
        )}
        {canCreateWallets && (
          <>
            <DropdownMenuItem
              onClick={() => pushFinanceHref('/wallets?create=wallet')}
            >
              <Wallet className="mr-2 h-4 w-4" />
              <span>{t('new_wallet')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => pushFinanceHref('/wallets?create=credit-card')}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              <span>{t('new_credit_card')}</span>
            </DropdownMenuItem>
          </>
        )}
        {canManageFinance && (
          <DropdownMenuItem
            onClick={() => pushFinanceHref('/budgets?create=budget')}
          >
            <Target className="mr-2 h-4 w-4" />
            <span>{t('new_budget')}</span>
          </DropdownMenuItem>
        )}
        {(canCreateInvoices || canCreateDebts || canManageFinance) && (
          <DropdownMenuSeparator />
        )}
        {canCreateInvoices && (
          <DropdownMenuItem onClick={() => pushFinanceHref('/invoices/new')}>
            <FileText className="mr-2 h-4 w-4" />
            <span>{t('new_invoice')}</span>
          </DropdownMenuItem>
        )}
        {canCreateDebts && (
          <DropdownMenuItem
            onClick={() => pushFinanceHref('/debts?create=debt')}
          >
            <TrendingDown className="mr-2 h-4 w-4" />
            <span>{t('new_debt')}</span>
          </DropdownMenuItem>
        )}
        {canCreateDebts && (
          <DropdownMenuItem
            onClick={() => pushFinanceHref('/debts?create=loan')}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            <span>{t('new_loan')}</span>
          </DropdownMenuItem>
        )}
        {canManageFinance && (
          <DropdownMenuItem onClick={() => pushFinanceHref('/categories')}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>{t('manage_categories')}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
