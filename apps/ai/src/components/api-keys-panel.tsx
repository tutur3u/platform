'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ChevronDownIcon,
  KeyRound,
  Plus,
  RefreshCw,
  Zap,
} from '@tuturuuu/icons';
import {
  type AiStudioApiKey,
  type AiStudioKeySecretResponse,
  type AiStudioKeysResponse,
  type CreateAiStudioKeyInput,
  createAiStudioKey,
  getAiStudioKeys,
  updateAiStudioKey,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { stagePlaygroundSecret } from '@/lib/playground-secret-transfer';
import { ApiKeyField, ApiKeyRow, ApiKeySecretDialog } from './api-key-items';
import { InfiniteLoadTrigger } from './infinite-load-trigger';
import { SectionCard } from './studio/section-card';
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeletonRows,
} from './studio/states';

export function ApiKeysPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('ai-studio.keys');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<
    'development' | 'staging' | 'production'
  >('development');
  const [expiresAt, setExpiresAt] = useState('');
  const [requestsPerMinute, setRequestsPerMinute] = useState('');
  const [creditBudget, setCreditBudget] = useState('');
  const [allowedModels, setAllowedModels] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<AiStudioKeySecretResponse | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AiStudioApiKey | null>(null);
  const keysQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: AiStudioKeysResponse) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getAiStudioKeys(workspaceId, { cursor: pageParam, limit: 50 }),
    queryKey: ['ai-studio-keys', workspaceId],
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['ai-studio-keys', workspaceId],
    });
  const createMutation = useMutation({
    mutationFn: (payload: CreateAiStudioKeyInput) =>
      createAiStudioKey(workspaceId, payload),
    onError: () => toast.error(t('action_error')),
    onSuccess: async (result) => {
      setSecret(result);
      setName('');
      setCreateOpen(false);
      await refresh();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      action,
      keyId,
    }: {
      action: 'revoke' | 'rotate';
      keyId: string;
    }) => updateAiStudioKey(workspaceId, keyId, action),
    onError: () => toast.error(t('action_error')),
    onSuccess: async (result, input) => {
      if (input.action === 'rotate' && 'secret' in result) setSecret(result);
      setRevokeTarget(null);
      await refresh();
    },
  });

  const approval = keysQuery.data?.pages[0]?.approval;
  const approved = approval?.approved ?? false;
  const keys = keysQuery.data?.pages.flatMap((page) => page.keys) ?? [];

  return (
    <div className="space-y-4">
      <Collapsible onOpenChange={setCreateOpen} open={createOpen}>
        <SectionCard
          actions={
            <>
              <Badge variant={approved ? 'default' : 'secondary'}>
                {keysQuery.isPending
                  ? t('loading')
                  : approved
                    ? t('approved')
                    : t('not_approved')}
              </Badge>
              <CollapsibleTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                  {t('configure')}
                  <ChevronDownIcon
                    className={`ml-2 size-3.5 transition-transform ${
                      createOpen ? 'rotate-180' : ''
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
            </>
          }
          description={
            keysQuery.isPending
              ? t('loading')
              : approved
                ? t('approved_description')
                : t('approval_required')
          }
          flush
          icon={KeyRound}
          title={t('create_title')}
        >
          <CollapsibleContent>
            <div className="grid gap-4 bg-muted/10 p-4 md:grid-cols-2 xl:grid-cols-3">
              <ApiKeyField label={t('name')}>
                <Input
                  disabled={!approved}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </ApiKeyField>
              <ApiKeyField label={t('environment')}>
                <Select
                  disabled={!approved}
                  onValueChange={(value) =>
                    setEnvironment(value as typeof environment)
                  }
                  value={environment}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">
                      {t('development')}
                    </SelectItem>
                    <SelectItem value="staging">{t('staging')}</SelectItem>
                    <SelectItem value="production">
                      {t('production')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </ApiKeyField>
              <ApiKeyField label={t('expires_at')}>
                <Input
                  disabled={!approved}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  type="date"
                  value={expiresAt}
                />
              </ApiKeyField>
              <ApiKeyField label={t('rate_limit')}>
                <Input
                  disabled={!approved}
                  min={1}
                  onChange={(event) => setRequestsPerMinute(event.target.value)}
                  type="number"
                  value={requestsPerMinute}
                />
              </ApiKeyField>
              <ApiKeyField label={t('credit_budget')}>
                <Input
                  disabled={!approved}
                  min={0}
                  onChange={(event) => setCreditBudget(event.target.value)}
                  step="0.0001"
                  type="number"
                  value={creditBudget}
                />
              </ApiKeyField>
              <ApiKeyField label={t('allowed_models')}>
                <Input
                  disabled={!approved}
                  onChange={(event) => setAllowedModels(event.target.value)}
                  placeholder={t('allowed_models_placeholder')}
                  value={allowedModels}
                />
              </ApiKeyField>
              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
                <Button
                  disabled={
                    !approved || !name.trim() || createMutation.isPending
                  }
                  onClick={() =>
                    createMutation.mutate({
                      allowedModels: allowedModels
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                      creditBudget: creditBudget
                        ? Number(creditBudget)
                        : undefined,
                      environment,
                      expiresAt: expiresAt
                        ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString()
                        : undefined,
                      name,
                      requestsPerMinute: requestsPerMinute
                        ? Number(requestsPerMinute)
                        : undefined,
                    })
                  }
                  type="button"
                >
                  <Plus className="mr-2 size-4" />
                  {t('create')}
                </Button>
                <Button
                  disabled={!approved || createMutation.isPending}
                  onClick={() =>
                    createMutation.mutate({
                      environment: 'development',
                      name: `Playground ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  <Zap className="mr-2 size-4" />
                  {t('quick_create')}
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </SectionCard>
      </Collapsible>

      <SectionCard
        actions={
          <Button
            className="size-8"
            disabled={keysQuery.isFetching}
            onClick={() => keysQuery.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`size-3.5 ${keysQuery.isFetching ? 'animate-spin' : ''}`}
            />
            <span className="sr-only">{t('refresh')}</span>
          </Button>
        }
        description={t('loaded_count', { count: keys.length })}
        flush
        footer={
          keys.length ? (
            <InfiniteLoadTrigger
              endLabel={t('end_of_list')}
              errorLabel={t('list_error')}
              hasError={keysQuery.isFetchNextPageError}
              hasNextPage={Boolean(keysQuery.hasNextPage)}
              isFetchingNextPage={keysQuery.isFetchingNextPage}
              loadedLabel={t('loaded_count', { count: keys.length })}
              loadingLabel={t('loading_more')}
              loadMoreLabel={t('load_more')}
              onLoadMore={() => void keysQuery.fetchNextPage()}
              retryLabel={t('refresh')}
            />
          ) : null
        }
        title={t('existing_title')}
      >
        <div className="space-y-2 p-4">
          {keysQuery.isPending ? (
            <StudioSkeletonRows
              count={3}
              label={t('loading')}
              rowClassName="h-[4.625rem]"
            />
          ) : keysQuery.isError && keys.length === 0 ? (
            <StudioErrorState
              description={t('list_error')}
              onRetry={() => void keysQuery.refetch()}
              retryLabel={t('refresh')}
              title={t('list_error')}
            />
          ) : keys.length ? (
            keys.map((key) => (
              <ApiKeyRow
                approvalGranted={approved}
                isPending={updateMutation.isPending}
                key={key.id}
                keyRecord={key}
                onRevoke={() => setRevokeTarget(key)}
                onRotate={() =>
                  updateMutation.mutate({ action: 'rotate', keyId: key.id })
                }
              />
            ))
          ) : (
            <StudioEmptyState icon={KeyRound} title={t('empty')} />
          )}
        </div>
      </SectionCard>

      <ApiKeySecretDialog
        onClose={() => setSecret(null)}
        onUseInPlayground={() => {
          if (!secret?.secret) return;
          stagePlaygroundSecret(workspaceId, secret.secret);
          setSecret(null);
          router.push(`/${workspaceId}/playground`);
        }}
        value={secret}
      />
      <Dialog
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        open={Boolean(revokeTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('revoke_title')}</DialogTitle>
            <DialogDescription>{t('revoke_description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setRevokeTarget(null)} variant="outline">
              {t('cancel')}
            </Button>
            <Button
              onClick={() =>
                revokeTarget &&
                updateMutation.mutate({
                  action: 'revoke',
                  keyId: revokeTarget.id,
                })
              }
              variant="destructive"
            >
              {t('revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
