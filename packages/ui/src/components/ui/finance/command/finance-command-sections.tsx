'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from '@tuturuuu/icons';
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
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { CommandGroup, CommandItem } from '../../command';
import { useFinanceHref } from '../finance-route-context';
import { listInfiniteTransactionsWithInternalApi } from '../transactions/internal-api';
import {
  buildFinanceCommandActionGroups,
  type FinanceCommandActionPermissions,
  renderFinanceCommandActionIcon,
} from './finance-command-actions';
import { buildFinanceRecentCommandGroups } from './finance-command-results';
import {
  FinanceCommandGroupList,
  matchesFinanceCommand,
} from './finance-command-group-list';
import { useFinanceDigitShortcuts } from './use-finance-digit-shortcuts';

/** Subset of the shared command center section context Finance reads. */
export interface FinanceCommandSectionContext {
  activeTab: string;
  isOpen: boolean;
  labels: { retry: string };
  mode: 'default' | 'quick-create';
  onClose: () => void;
  query: string;
}

export interface FinanceCommandSectionsProps
  extends FinanceCommandActionPermissions {
  context: FinanceCommandSectionContext;
  currency?: string;
  workspaceSlug: string;
  wsId: string;
}

/**
 * Finance contributions to the shared command center: Create and Tools
 * actions filtered by the caller's permissions, plus remote record search in
 * the All scope. Quick-create sessions keep bare digit shortcuts.
 */
export function FinanceCommandSections({
  context,
  currency = 'USD',
  workspaceSlug,
  wsId,
  ...permissions
}: FinanceCommandSectionsProps) {
  const router = useRouter();
  const locale = useLocale();
  const tCommand = useTranslations('finance-command-center');
  const tFinance = useTranslations('finance');
  const financeHref = useFinanceHref();
  const { activeTab, isOpen, mode, onClose } = context;
  const search = context.query.trim();
  const quickCreate = mode === 'quick-create';
  const showActions = activeTab === 'all' || activeTab === 'actions';
  const searchEnabled = isOpen && !quickCreate && activeTab === 'all';

  const pushFinanceHref = useCallback(
    (path: string) => {
      onClose();
      router.push(`/${workspaceSlug}${financeHref(path)}`);
    },
    [financeHref, onClose, router, workspaceSlug]
  );

  const transactionsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () =>
      listInfiniteTransactionsWithInternalApi(wsId, {
        limit: 6,
        q: search || undefined,
      }),
    queryKey: ['finance-command-center', wsId, 'transactions', search],
  });
  const walletsQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () => listInfiniteWallets(wsId, { limit: 6, q: search || undefined }),
    queryKey: ['finance-command-center', wsId, 'wallets', search],
  });
  const invoicesQuery = useQuery({
    enabled: searchEnabled,
    queryFn: () =>
      listFinanceInvoices(wsId, {
        page: 1,
        pageSize: 6,
        q: search || undefined,
      }),
    queryKey: ['finance-command-center', wsId, 'invoices', search],
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
  const remoteQueries = [
    transactionsQuery,
    walletsQuery,
    invoicesQuery,
    budgetsQuery,
    debtsQuery,
    recurringQuery,
    categoriesQuery,
    tagsQuery,
  ];
  const remoteLoading = remoteQueries.some((query) => query.isLoading);
  const failedQueries = remoteQueries.filter((query) => query.isError);

  const actionGroups = useMemo<QuickCommandCenterGroup[]>(
    () =>
      buildFinanceCommandActionGroups({ permissions, tCommand, tFinance }).map(
        (group) => ({
          heading: group.heading,
          id: group.id,
          items: group.items
            .map((action) => ({
              description: action.description,
              icon: renderFinanceCommandActionIcon(action),
              id: action.id,
              keywords: [action.href],
              onSelect: () => pushFinanceHref(action.href),
              title: action.title,
            }))
            .filter((item) => matchesFinanceCommand(item, search)),
        })
      ),
    [
      permissions,
      pushFinanceHref,
      search,
      tCommand,
      tFinance,
    ]
  );
  const visibleActions = useMemo(
    () => actionGroups.flatMap((group) => group.items),
    [actionGroups]
  );
  useFinanceDigitShortcuts({
    enabled: isOpen && quickCreate && showActions,
    items: visibleActions,
  });

  const recentGroups = useMemo<QuickCommandCenterGroup[]>(
    () =>
      searchEnabled
        ? buildFinanceRecentCommandGroups({
            budgets: budgetsQuery.data,
            categories: categoriesQuery.data,
            currency,
            debts: debtsQuery.data,
            invoices: invoicesQuery.data?.data,
            locale,
            pushFinanceHref,
            recurring: recurringQuery.data,
            search,
            tags: tagsQuery.data,
            tCommand,
            tFinance,
            transactions: transactionsQuery.data?.data,
            wallets: walletsQuery.data?.data,
          })
        : [],
    [
      budgetsQuery.data,
      categoriesQuery.data,
      currency,
      debtsQuery.data,
      invoicesQuery.data,
      locale,
      pushFinanceHref,
      recurringQuery.data,
      search,
      searchEnabled,
      tagsQuery.data,
      tCommand,
      tFinance,
      transactionsQuery.data,
      walletsQuery.data,
    ]
  );

  if (!showActions) return null;

  return (
    <>
      <FinanceCommandGroupList
        digitShortcuts={quickCreate}
        groups={actionGroups}
      />
      {searchEnabled && (remoteLoading || failedQueries.length > 0) ? (
        <CommandGroup heading={tCommand('title')}>
          {remoteLoading ? (
            <CommandItem disabled value="finance-records-loading">
              <Loader2 className="size-4 animate-spin" />
              <span>{tCommand('searching')}</span>
            </CommandItem>
          ) : null}
          {failedQueries.length > 0 ? (
            <CommandItem
              onSelect={() => {
                for (const query of failedQueries) void query.refetch();
              }}
              value="finance-records-retry"
            >
              <AlertTriangle className="size-4 text-dynamic-red" />
              <span className="min-w-0 flex-1 truncate">
                {tCommand('search_failed')}
              </span>
              <span className="text-muted-foreground text-xs">
                {context.labels.retry}
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      ) : null}
      <FinanceCommandGroupList groups={recentGroups} query={search} />
    </>
  );
}
