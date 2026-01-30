'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingDown, TrendingUp } from '@tuturuuu/icons';
import type {
  DebtLoanSummary,
  DebtLoanType,
  DebtLoanWithBalance,
} from '@tuturuuu/types/primitives/DebtLoan';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import { Separator } from '../../separator';
import { Skeleton } from '../../skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../tabs';
import { DebtLoanForm } from './debt-loan-form';
import { DebtLoanList } from './debt-loan-list';
import { DebtLoanSummaryCards } from './debt-loan-summary';

interface Props {
  wsId: string;
  searchParams?: {
    type?: string;
  };
}

export function DebtsPage({ wsId, searchParams }: Props) {
  const t = useTranslations('ws-debt-loan');
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [defaultCreateType, setDefaultCreateType] =
    useState<DebtLoanType>('debt');
  const [activeTab, setActiveTab] = useState<string>(
    searchParams?.type || 'all'
  );

  // Fetch summary
  const { data: summary, isLoading: isLoadingSummary } =
    useQuery<DebtLoanSummary>({
      queryKey: ['debt-loan-summary', wsId],
      queryFn: async () => {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/finance/debts/summary`
        );
        if (!res.ok) throw new Error('Failed to fetch summary');
        return res.json();
      },
    });

  // Fetch debts/loans based on active tab
  const { data: debtLoans = [], isLoading: isLoadingDebtLoans } = useQuery<
    DebtLoanWithBalance[]
  >({
    queryKey: ['debt-loans', wsId, activeTab],
    queryFn: async () => {
      const typeParam = activeTab !== 'all' ? `?type=${activeTab}` : '';
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/finance/debts${typeParam}`
      );
      if (!res.ok) throw new Error('Failed to fetch debt/loans');
      return res.json();
    },
  });

  // Fetch wallets for the form
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/wallets`);
      if (!res.ok) throw new Error('Failed to fetch wallets');
      return res.json();
    },
  });

  const handleCreateNew = (type: DebtLoanType = 'debt') => {
    setDefaultCreateType(type);
    setIsCreateDialogOpen(true);
  };

  const handleFormFinish = () => {
    setIsCreateDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['debt-loans', wsId] });
    queryClient.invalidateQueries({ queryKey: ['debt-loan-summary', wsId] });
  };

  // Filter for active items
  const activeDebts = debtLoans.filter(
    (dl) => dl.type === 'debt' && dl.status === 'active'
  );
  const activeLoans = debtLoans.filter(
    (dl) => dl.type === 'loan' && dl.status === 'active'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('page_description')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleCreateNew('loan')}
            className="gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            {t('new_loan')}
          </Button>
          <Button onClick={() => handleCreateNew('debt')} className="gap-2">
            <TrendingDown className="h-4 w-4" />
            {t('new_debt')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoadingSummary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : summary ? (
        <DebtLoanSummaryCards summary={summary} wsId={wsId} />
      ) : null}

      <Separator />

      {/* Tabs for filtering */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="debt">
            {t('debts')} ({activeDebts.length})
          </TabsTrigger>
          <TabsTrigger value="loan">
            {t('loans')} ({activeLoans.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {isLoadingDebtLoans ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <DebtLoanList
              debtLoans={debtLoans}
              wsId={wsId}
              onCreateNew={() => handleCreateNew('debt')}
            />
          )}
        </TabsContent>

        <TabsContent value="debt" className="mt-6">
          {isLoadingDebtLoans ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <DebtLoanList
              debtLoans={debtLoans.filter((dl) => dl.type === 'debt')}
              wsId={wsId}
              onCreateNew={() => handleCreateNew('debt')}
              emptyMessage={t('no_debts')}
            />
          )}
        </TabsContent>

        <TabsContent value="loan" className="mt-6">
          {isLoadingDebtLoans ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <DebtLoanList
              debtLoans={debtLoans.filter((dl) => dl.type === 'loan')}
              wsId={wsId}
              onCreateNew={() => handleCreateNew('loan')}
              emptyMessage={t('no_loans')}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-150">
          <DialogHeader>
            <DialogTitle>
              {defaultCreateType === 'debt' ? t('new_debt') : t('new_loan')}
            </DialogTitle>
            <DialogDescription>
              {defaultCreateType === 'debt'
                ? t('new_debt_description')
                : t('new_loan_description')}
            </DialogDescription>
          </DialogHeader>
          <DebtLoanForm
            wsId={wsId}
            wallets={wallets}
            defaultType={defaultCreateType}
            onFinish={handleFormFinish}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
