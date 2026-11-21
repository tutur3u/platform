'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Database,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from '@tuturuuu/icons';
import {
  type InfrastructureAiStudioWorkspacePoliciesPage,
  listInfrastructureAiStudioWorkspacePolicies,
} from '@tuturuuu/internal-api/infrastructure';
import { Accordion } from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { updateWorkspaceAiStudioPolicyAction } from './actions';
import type { AiStudioWorkspacePolicy } from './types';
import { WorkspacePolicyCard } from './workspace-policy-card';
import { WorkspacePolicyState } from './workspace-policy-state';

const PAGE_SIZE = 40;

export function WorkspaceAiStudioPoliciesSection({
  infrastructureWsId,
}: {
  infrastructureWsId: string;
}) {
  const t = useTranslations('ai-studio-admin');
  const [drafts, setDrafts] = useState<
    Record<string, Partial<AiStudioWorkspacePolicy>>
  >({});
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const queryClient = useQueryClient();
  const policiesQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: InfrastructureAiStudioWorkspacePoliciesPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listInfrastructureAiStudioWorkspacePolicies({
        cursor: pageParam,
        limit: PAGE_SIZE,
        q: deferredQuery || undefined,
      }),
    queryKey: ['ai-studio-policy-workspaces', deferredQuery],
    staleTime: 30_000,
  });
  const policies = [
    ...new Map(
      (policiesQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
        (policy) => [
          policy.wsId,
          {
            ...policy,
            ...drafts[policy.wsId],
          },
        ]
      )
    ).values(),
  ];
  const saveMutation = useMutation({
    mutationFn: (policy: AiStudioWorkspacePolicy) =>
      updateWorkspaceAiStudioPolicyAction(infrastructureWsId, policy),
    onError: (error) => {
      console.error(error);
      toast.error(t('save_error'));
    },
    onSuccess: async (_, policy) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[policy.wsId];
        return next;
      });
      await queryClient.invalidateQueries({
        queryKey: ['ai-studio-policy-workspaces'],
      });
      toast.success(t('saved'));
    },
  });

  function updatePolicy(wsId: string, patch: Partial<AiStudioWorkspacePolicy>) {
    setDrafts((current) => ({
      ...current,
      [wsId]: { ...current[wsId], ...patch },
    }));
  }

  function savePolicy(policy: AiStudioWorkspacePolicy) {
    saveMutation.mutate(policy);
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="space-y-3 border-b bg-muted/20 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t('workspaces.title')}
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('workspaces.description')}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-muted-foreground text-xs">
            <Database className="size-3.5" />
            {t('workspaces.loaded_count', { count: policies.length })}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-9 pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('workspaces.search')}
            value={query}
          />
          {policiesQuery.isFetching ? (
            <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {t('workspaces.search_hint')}
        </p>
      </div>
      {policies.length ? (
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(8rem,0.55fr)_minmax(8rem,0.5fr)_minmax(9rem,0.65fr)_2rem] gap-3 border-b bg-muted/30 px-4 py-2 font-medium text-muted-foreground text-xs md:grid">
          <span>{t('workspaces.column_workspace')}</span>
          <span>{t('workspaces.column_approval')}</span>
          <span>{t('workspaces.column_models')}</span>
          <span>{t('workspaces.column_overrides')}</span>
          <span className="sr-only">{t('workspaces.column_actions')}</span>
        </div>
      ) : null}
      <Accordion className="divide-y" collapsible type="single">
        {policies.map((policy) => {
          const isSaving =
            saveMutation.isPending &&
            saveMutation.variables?.wsId === policy.wsId;
          return (
            <WorkspacePolicyCard
              isDirty={Boolean(drafts[policy.wsId])}
              isPending={isSaving}
              key={policy.wsId}
              onChange={(patch) => updatePolicy(policy.wsId, patch)}
              onSave={() => savePolicy(policy)}
              policy={policy}
            />
          );
        })}
      </Accordion>
      <WorkspacePolicyState
        isError={policiesQuery.isError}
        isPending={policiesQuery.isPending}
        isEmpty={policies.length === 0}
        onRetry={() => policiesQuery.refetch()}
      />
      {policiesQuery.hasNextPage || policiesQuery.isFetchNextPageError ? (
        <div className="flex justify-center border-t bg-muted/10 p-3">
          <Button
            disabled={policiesQuery.isFetchingNextPage}
            onClick={() => void policiesQuery.fetchNextPage()}
            size="sm"
            variant="outline"
          >
            {policiesQuery.isFetchingNextPage ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {policiesQuery.isFetchingNextPage
              ? t('workspaces.loading_more')
              : t('workspaces.load_more')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
