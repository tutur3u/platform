'use client';

import {
  Plus,
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
import { Fragment } from 'react';
import {
  buildFinanceCommandActionGroups,
  renderFinanceCommandActionIcon,
} from '../command/finance-command-actions';
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
  const commandT = useTranslations('finance-command-center');
  const financeHref = useFinanceHref();
  const groups = buildFinanceCommandActionGroups({
    permissions: {
      canCreateDebts,
      canCreateInvoices,
      canCreateRecurringTransactions,
      canCreateTransactions,
      canCreateWallets,
      canManageFinance,
    },
    tCommand: commandT,
    tFinance: t,
  });
  const hasVisibleActions = groups.some((group) => group.items.length > 0);

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
        {groups.map((group, groupIndex) => (
          <Fragment key={group.id}>
            <DropdownMenuSeparator />
            {groupIndex > 0 && (
              <DropdownMenuLabel>{group.heading}</DropdownMenuLabel>
            )}
            {group.items.map((action) => (
              <DropdownMenuItem
                key={action.id}
                onClick={() => pushFinanceHref(action.href)}
              >
                <span className="mr-2">
                  {renderFinanceCommandActionIcon(action)}
                </span>
                <span>{action.title}</span>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
