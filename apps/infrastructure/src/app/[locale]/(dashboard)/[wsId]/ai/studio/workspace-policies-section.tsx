'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState, useTransition } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { updateWorkspaceAiStudioPolicyAction } from './actions';
import type { AiStudioWorkspacePolicy } from './types';
import { WorkspacePolicyCard } from './workspace-policy-card';

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
  const [isPending, startTransition] = useTransition();
  const policiesQuery = useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (deferredQuery) params.set('q', deferredQuery);
      return apiFetch<AiStudioWorkspacePolicy[]>(
        `/api/v1/infrastructure/ai/studio/workspaces?${params.toString()}`
      );
    },
    queryKey: ['ai-studio-policy-workspaces', deferredQuery],
    staleTime: 30_000,
  });
  const policies = (policiesQuery.data ?? []).map((policy) => ({
    ...policy,
    ...drafts[policy.wsId],
  }));

  function updatePolicy(wsId: string, patch: Partial<AiStudioWorkspacePolicy>) {
    setDrafts((current) => ({
      ...current,
      [wsId]: { ...current[wsId], ...patch },
    }));
  }

  function savePolicy(policy: AiStudioWorkspacePolicy) {
    startTransition(async () => {
      try {
        await updateWorkspaceAiStudioPolicyAction(infrastructureWsId, policy);
        setDrafts((current) => {
          const next = { ...current };
          delete next[policy.wsId];
          return next;
        });
        await policiesQuery.refetch();
        toast.success(t('saved'));
      } catch (error) {
        console.error(error);
        toast.error(t('save_error'));
      }
    });
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="space-y-4 border-b p-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t('workspaces.title')}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('workspaces.description')}
          </p>
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
      </div>
      <div className="divide-y">
        {policies.map((policy) => (
          <WorkspacePolicyCard
            isPending={isPending}
            key={policy.wsId}
            onChange={(patch) => updatePolicy(policy.wsId, patch)}
            onSave={() => savePolicy(policy)}
            policy={policy}
          />
        ))}
        <WorkspacePolicyState
          isError={policiesQuery.isError}
          isPending={policiesQuery.isPending}
          isEmpty={policies.length === 0}
          onRetry={() => policiesQuery.refetch()}
        />
      </div>
    </section>
  );
}

function WorkspacePolicyState({
  isEmpty,
  isError,
  isPending,
  onRetry,
}: {
  isEmpty: boolean;
  isError: boolean;
  isPending: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('ai-studio-admin');
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted-foreground text-sm">
          {t('workspaces.load_error')}
        </p>
        <Button onClick={onRetry} size="sm" variant="outline">
          <RefreshCw className="mr-2 size-4" />
          {t('workspaces.retry')}
        </Button>
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t('workspaces.loading')}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="p-10 text-center text-muted-foreground text-sm">
        {t('workspaces.empty')}
      </div>
    );
  }
  return null;
}
