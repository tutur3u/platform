'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  type InternalAccountSortBy,
  type InternalAccountSortDirection,
  type ListInternalAccountsResponse,
  listInternalAccounts,
  type UpdateInternalAccountPayload,
  updateInternalAccount,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useRef, useState } from 'react';
import { InternalAccountRow } from './internal-account-row';
import { InternalAccountsToolbar } from './internal-accounts-toolbar';

const QUERY_KEY = ['infrastructure', 'internal-accounts'] as const;

interface MutationInput {
  payload: UpdateInternalAccountPayload;
  userId: string;
}

export function InternalAccountsClient() {
  const t = useTranslations('internal-accounts');
  const queryClient = useQueryClient();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [sortBy, setSortBy] = useState<InternalAccountSortBy>('displayName');
  const [sortDirection, setSortDirection] =
    useState<InternalAccountSortDirection>('asc');

  const accountsQuery = useInfiniteQuery<ListInternalAccountsResponse>({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listInternalAccounts({
        activeOnly,
        cursor: pageParam as string | undefined,
        limit: 24,
        q: query || undefined,
        sortBy,
        sortDirection,
        verifiedOnly,
      }),
    queryKey: [
      ...QUERY_KEY,
      { activeOnly, query, sortBy, sortDirection, verifiedOnly },
    ],
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

  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node || !accountsQuery.hasNextPage) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && !accountsQuery.isFetchingNextPage) {
          void accountsQuery.fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [
      accountsQuery.fetchNextPage,
      accountsQuery.hasNextPage,
      accountsQuery.isFetchingNextPage,
    ]
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draftQuery.trim());
  }

  const accounts =
    accountsQuery.data?.pages.flatMap((page) => page.accounts) ?? [];
  const count = accountsQuery.data?.pages[0]?.count;

  return (
    <div className="space-y-4">
      <InternalAccountsToolbar
        activeOnly={activeOnly}
        count={count}
        draftQuery={draftQuery}
        isFetching={accountsQuery.isFetching}
        onActiveOnlyChange={setActiveOnly}
        onDraftQueryChange={setDraftQuery}
        onRefresh={() => void accountsQuery.refetch()}
        onSearch={submitSearch}
        onSortByChange={setSortBy}
        onSortDirectionChange={setSortDirection}
        onVerifiedOnlyChange={setVerifiedOnly}
        sortBy={sortBy}
        sortDirection={sortDirection}
        verifiedOnly={verifiedOnly}
      />

      {accountsQuery.isLoading ? <AccountsSkeleton /> : null}

      {accountsQuery.isError ? (
        <div className="space-y-3 rounded-xl border bg-card p-6">
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

      {!accountsQuery.isLoading &&
      !accountsQuery.isError &&
      accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">{t('empty.title')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('empty.description')}
          </p>
        </div>
      ) : null}

      {accounts.length ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {accounts.map((account) => (
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

      {accountsQuery.hasNextPage ? (
        <div className="flex justify-center py-2" ref={loadMoreRef}>
          {accountsQuery.isFetchingNextPage ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <Button
              onClick={() => accountsQuery.fetchNextPage()}
              variant="ghost"
            >
              {t('actions.load_more')}
            </Button>
          )}
        </div>
      ) : accounts.length ? (
        <p className="text-center text-muted-foreground text-xs">
          {t('end_of_list')}
        </p>
      ) : null}
    </div>
  );
}

function AccountsSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-xl border">
      {[0, 1, 2, 3].map((item) => (
        <div className="flex items-center gap-4 p-4" key={item}>
          <Skeleton className="size-10 rounded-full" />
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
