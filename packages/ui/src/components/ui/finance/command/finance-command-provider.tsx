'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listBudgets,
  listDebtLoans,
  listFinanceInvoices,
  listInfiniteWallets,
  listRecurringTransactions,
  listTransactionCategories,
  listTransactionTags,
} from '@tuturuuu/internal-api/finance';
import type { QuickCommandCenterGroup } from '@tuturuuu/ui/quick-command-center';
import { QuickCommandCenter } from '@tuturuuu/ui/quick-command-center';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFinanceHref } from '../finance-route-context';
import { listInfiniteTransactionsWithInternalApi } from '../transactions/internal-api';
import {
  buildFinanceCommandActionGroups,
  type FinanceCommandActionPermissions,
  renderFinanceCommandActionIcon,
} from './finance-command-actions';
import { buildFinanceRecentCommandGroups } from './finance-command-results';

interface FinanceCommandProviderProps extends FinanceCommandActionPermissions {
  currency?: string;
  workspaceSlug: string;
  wsId: string;
}

type CommandMode = 'quick-create' | 'search';

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]'
    )
  );
}

export function FinanceCommandProvider({
  currency = 'USD',
  workspaceSlug,
  wsId,
  ...permissions
}: FinanceCommandProviderProps) {
  const router = useRouter();
  const locale = useLocale();
  const tCommand = useTranslations('finance-command-center');
  const tFinance = useTranslations('finance');
  const financeHref = useFinanceHref();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CommandMode>('quick-create');
  const [search, setSearch] = useState('');
  const trimmedSearch = search.trim();
  const searchEnabled = open && mode === 'search';

  const pushFinanceHref = useCallback(
    (path: string) => {
      setOpen(false);
      setSearch('');
      router.push(`/${workspaceSlug}${financeHref(path)}`);
    },
    [financeHref, router, workspaceSlug]
  );

  useEffect(() => {
    const handleFinanceShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || isEditableTarget(event.target)) return;

      if (
        event.key.toLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setMode('search');
        setOpen(true);
        return;
      }

      if (
        event.key.toLowerCase() === 'c' &&
        !(event.metaKey || event.ctrlKey || event.altKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setMode('quick-create');
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleFinanceShortcut, {
      capture: true,
    });

    return () =>
      window.removeEventListener('keydown', handleFinanceShortcut, {
        capture: true,
      });
  }, []);

  const transactionsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () =>
      listInfiniteTransactionsWithInternalApi(wsId, {
        limit: 6,
        q: trimmedSearch || undefined,
      }),
    queryKey: ['finance-command-center', wsId, 'transactions', trimmedSearch],
  });
  const walletsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () =>
      listInfiniteWallets(wsId, {
        limit: 6,
        q: trimmedSearch || undefined,
      }),
    queryKey: ['finance-command-center', wsId, 'wallets', trimmedSearch],
  });
  const invoicesQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () =>
      listFinanceInvoices(wsId, {
        page: 1,
        pageSize: 6,
        q: trimmedSearch || undefined,
      }),
    queryKey: ['finance-command-center', wsId, 'invoices', trimmedSearch],
  });
  const budgetsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () => listBudgets(wsId),
    queryKey: ['finance-command-center', wsId, 'budgets'],
  });
  const debtsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () => listDebtLoans(wsId),
    queryKey: ['finance-command-center', wsId, 'debts'],
  });
  const recurringQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () => listRecurringTransactions(wsId),
    queryKey: ['finance-command-center', wsId, 'recurring'],
  });
  const categoriesQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () => listTransactionCategories(wsId),
    queryKey: ['finance-command-center', wsId, 'categories'],
  });
  const tagsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () => listTransactionTags(wsId),
    queryKey: ['finance-command-center', wsId, 'tags'],
  });

  const actionGroups = useMemo<QuickCommandCenterGroup[]>(
    () =>
      buildFinanceCommandActionGroups({
        permissions,
        tCommand,
        tFinance,
      }).map((group) => ({
        heading: group.heading,
        id: group.id,
        items: group.items.map((action) => ({
          description: action.description,
          icon: renderFinanceCommandActionIcon(action),
          id: action.id,
          keywords: [action.href],
          onSelect: () => pushFinanceHref(action.href),
          title: action.title,
        })),
      })),
    // biome-ignore lint/correctness/useExhaustiveDependencies: `permissions` is the rest-spread of stable boolean props; its identity churns each render but the memo body is a cheap synchronous mapping.
    [permissions, pushFinanceHref, tCommand, tFinance]
  );

  const recentGroups = useMemo<QuickCommandCenterGroup[]>(() => {
    if (mode !== 'search') return [];

    return buildFinanceRecentCommandGroups({
      budgets: budgetsQuery.data,
      categories: categoriesQuery.data,
      currency,
      debts: debtsQuery.data,
      invoices: invoicesQuery.data?.data,
      locale,
      pushFinanceHref,
      recurring: recurringQuery.data,
      search: trimmedSearch,
      tags: tagsQuery.data,
      tCommand,
      tFinance,
      transactions: transactionsQuery.data?.data,
      wallets: walletsQuery.data?.data,
    });
  }, [
    budgetsQuery.data,
    categoriesQuery.data,
    currency,
    debtsQuery.data,
    invoicesQuery.data,
    locale,
    mode,
    pushFinanceHref,
    recurringQuery.data,
    tagsQuery.data,
    tCommand,
    tFinance,
    transactionsQuery.data,
    trimmedSearch,
    walletsQuery.data,
  ]);

  const groups =
    mode === 'quick-create' ? actionGroups : [...actionGroups, ...recentGroups];

  return (
    <QuickCommandCenter
      digitShortcuts={mode === 'quick-create'}
      emptyLabel={tCommand('empty')}
      groups={groups}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
      onSearchValueChange={setSearch}
      open={open}
      placeholder={
        mode === 'quick-create'
          ? tCommand('quick_placeholder')
          : tCommand('search_placeholder')
      }
      searchValue={search}
      title={
        mode === 'quick-create'
          ? tCommand('quick_create_title')
          : tCommand('title')
      }
      description={tCommand('description')}
    />
  );
}
