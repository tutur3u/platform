'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { AlertCircle, Plus, RefreshCw, Zap } from '@tuturuuu/icons';
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
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
  const keys = keysQuery.data?.pages.flatMap((page) => page.keys) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t('create_title')}</CardTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              {keysQuery.isPending
                ? t('loading')
                : approval?.approved
                  ? t('approved_description')
                  : t('approval_required')}
            </p>
          </div>
          <Badge variant={approval?.approved ? 'default' : 'secondary'}>
            {keysQuery.isPending
              ? t('loading')
              : approval?.approved
                ? t('approved')
                : t('not_approved')}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ApiKeyField label={t('name')}>
            <Input
              disabled={!approval?.approved}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </ApiKeyField>
          <ApiKeyField label={t('environment')}>
            <Select
              disabled={!approval?.approved}
              onValueChange={(value) =>
                setEnvironment(value as typeof environment)
              }
              value={environment}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="development">{t('development')}</SelectItem>
                <SelectItem value="staging">{t('staging')}</SelectItem>
                <SelectItem value="production">{t('production')}</SelectItem>
              </SelectContent>
            </Select>
          </ApiKeyField>
          <ApiKeyField label={t('expires_at')}>
            <Input
              disabled={!approval?.approved}
              onChange={(event) => setExpiresAt(event.target.value)}
              type="date"
              value={expiresAt}
            />
          </ApiKeyField>
          <ApiKeyField label={t('rate_limit')}>
            <Input
              disabled={!approval?.approved}
              min={1}
              onChange={(event) => setRequestsPerMinute(event.target.value)}
              type="number"
              value={requestsPerMinute}
            />
          </ApiKeyField>
          <ApiKeyField label={t('credit_budget')}>
            <Input
              disabled={!approval?.approved}
              min={0}
              onChange={(event) => setCreditBudget(event.target.value)}
              step="0.0001"
              type="number"
              value={creditBudget}
            />
          </ApiKeyField>
          <ApiKeyField label={t('allowed_models')}>
            <Input
              disabled={!approval?.approved}
              onChange={(event) => setAllowedModels(event.target.value)}
              placeholder={t('allowed_models_placeholder')}
              value={allowedModels}
            />
          </ApiKeyField>
          <div className="md:col-span-2 xl:col-span-3">
            <Button
              disabled={
                !approval?.approved || !name.trim() || createMutation.isPending
              }
              onClick={() =>
                createMutation.mutate({
                  allowedModels: allowedModels
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                  creditBudget: creditBudget ? Number(creditBudget) : undefined,
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
            >
              <Plus className="mr-2 size-4" />
              {t('create')}
            </Button>
            <Button
              disabled={!approval?.approved || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  environment: 'development',
                  name: `Playground ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
                })
              }
              variant="outline"
            >
              <Zap className="mr-2 size-4" />
              {t('quick_create')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('existing_title')}</CardTitle>
          <Button
            disabled={keysQuery.isFetching}
            onClick={() => keysQuery.refetch()}
            size="icon"
            variant="outline"
          >
            <RefreshCw className="size-4" />
            <span className="sr-only">{t('refresh')}</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {keysQuery.isPending ? (
            <div aria-label={t('loading')} className="space-y-2" role="status">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  className="h-[4.625rem] animate-pulse rounded-xl bg-foreground/5"
                  key={index}
                />
              ))}
            </div>
          ) : keysQuery.isError ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
              <AlertCircle className="size-5 text-dynamic-red" />
              <p className="text-muted-foreground text-sm">{t('list_error')}</p>
              <Button
                onClick={() => void keysQuery.refetch()}
                size="sm"
                variant="outline"
              >
                <RefreshCw className="mr-2 size-4" />
                {t('refresh')}
              </Button>
            </div>
          ) : (
            keys.map((key) => (
              <ApiKeyRow
                approvalGranted={approval?.approved ?? false}
                isPending={updateMutation.isPending}
                key={key.id}
                keyRecord={key}
                onRevoke={() => setRevokeTarget(key)}
                onRotate={() =>
                  updateMutation.mutate({ action: 'rotate', keyId: key.id })
                }
              />
            ))
          )}
          {!keysQuery.isPending && !keysQuery.isError && keys.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
              {t('empty')}
            </div>
          ) : null}
          {keysQuery.hasNextPage ? (
            <div className="flex justify-center border-t pt-3">
              <Button
                disabled={keysQuery.isFetchingNextPage}
                onClick={() => void keysQuery.fetchNextPage()}
                variant="outline"
              >
                {keysQuery.isFetchingNextPage
                  ? t('loading_more')
                  : t('load_more')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
