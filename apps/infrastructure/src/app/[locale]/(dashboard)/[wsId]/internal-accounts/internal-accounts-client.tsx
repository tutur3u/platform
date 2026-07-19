'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search } from '@tuturuuu/icons';
import {
  listInternalAccounts,
  type UpdateInternalAccountPayload,
  updateInternalAccount,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { InternalAccountRow } from './internal-account-row';

const QUERY_KEY = ['infrastructure', 'internal-accounts'] as const;

interface MutationInput {
  payload: UpdateInternalAccountPayload;
  userId: string;
}

export function InternalAccountsClient() {
  const t = useTranslations('internal-accounts');
  const queryClient = useQueryClient();
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');

  const accountsQuery = useQuery({
    queryFn: () => listInternalAccounts({ q: query || undefined }),
    queryKey: [...QUERY_KEY, query],
    staleTime: 10_000,
  });

  const accountMutation = useMutation({
    mutationFn: ({ payload, userId }: MutationInput) =>
      updateInternalAccount(userId, payload),
    onError: () => toast.error(t('toasts.update_failed')),
    onSuccess: async () => {
      toast.success(t('toasts.updated'));
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draftQuery.trim());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={submitSearch}>
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t('search.label')}
              className="pl-9"
              data-testid="internal-account-search"
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t('search.placeholder')}
              value={draftQuery}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t('actions.search')}
          </Button>
        </form>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="text-muted-foreground text-sm">
            {accountsQuery.data
              ? t('count', { count: accountsQuery.data.count })
              : t('count_loading')}
          </p>
          <Button
            aria-label={t('actions.refresh')}
            disabled={accountsQuery.isFetching}
            onClick={() => accountsQuery.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 ${accountsQuery.isFetching ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {accountsQuery.isLoading ? <AccountsSkeleton /> : null}

      {accountsQuery.isError ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-6">
          <div>
            <p className="font-semibold">{t('error.title')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('error.description')}
            </p>
          </div>
          <Button
            onClick={() => accountsQuery.refetch()}
            type="button"
            variant="secondary"
          >
            {t('actions.retry')}
          </Button>
        </div>
      ) : null}

      {accountsQuery.data?.accounts.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty.title')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('empty.description')}
          </p>
        </div>
      ) : null}

      {accountsQuery.data?.accounts.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {accountsQuery.data.accounts.map((account) => (
            <InternalAccountRow
              account={account}
              isWorking={
                accountMutation.isPending &&
                accountMutation.variables?.userId === account.id
              }
              key={account.id}
              onConfirm={(payload) =>
                accountMutation.mutateAsync({ payload, userId: account.id })
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AccountsSkeleton() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {[0, 1, 2].map((item) => (
        <div className="flex items-center gap-4 p-4" key={item}>
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-9 w-32 sm:block" />
        </div>
      ))}
    </div>
  );
}
