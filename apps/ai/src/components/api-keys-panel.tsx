'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, RefreshCw, Trash2 } from '@tuturuuu/icons';
import {
  type AiStudioApiKey,
  type AiStudioKeySecretResponse,
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
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ApiKeysPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('ai-studio.keys');
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
  const keysQuery = useQuery({
    queryFn: () => getAiStudioKeys(workspaceId),
    queryKey: ['ai-studio-keys', workspaceId],
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['ai-studio-keys', workspaceId],
    });
  const createMutation = useMutation({
    mutationFn: () =>
      createAiStudioKey(workspaceId, {
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
      }),
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

  const approval = keysQuery.data?.approval;
  const keys = keysQuery.data?.keys ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t('create_title')}</CardTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              {approval?.approved
                ? t('approved_description')
                : t('approval_required')}
            </p>
          </div>
          <Badge variant={approval?.approved ? 'default' : 'secondary'}>
            {approval?.approved ? t('approved') : t('not_approved')}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label={t('name')}>
            <Input
              disabled={!approval?.approved}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <Field label={t('environment')}>
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
          </Field>
          <Field label={t('expires_at')}>
            <Input
              disabled={!approval?.approved}
              onChange={(event) => setExpiresAt(event.target.value)}
              type="date"
              value={expiresAt}
            />
          </Field>
          <Field label={t('rate_limit')}>
            <Input
              disabled={!approval?.approved}
              min={1}
              onChange={(event) => setRequestsPerMinute(event.target.value)}
              type="number"
              value={requestsPerMinute}
            />
          </Field>
          <Field label={t('credit_budget')}>
            <Input
              disabled={!approval?.approved}
              min={0}
              onChange={(event) => setCreditBudget(event.target.value)}
              step="0.0001"
              type="number"
              value={creditBudget}
            />
          </Field>
          <Field label={t('allowed_models')}>
            <Input
              disabled={!approval?.approved}
              onChange={(event) => setAllowedModels(event.target.value)}
              placeholder={t('allowed_models_placeholder')}
              value={allowedModels}
            />
          </Field>
          <div className="md:col-span-2 xl:col-span-3">
            <Button
              disabled={
                !approval?.approved || !name.trim() || createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              <Plus className="mr-2 size-4" />
              {t('create')}
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
          {keys.map((key) => (
            <KeyRow
              approvalGranted={approval?.approved ?? false}
              isPending={updateMutation.isPending}
              key={key.id}
              keyRecord={key}
              onRevoke={() => setRevokeTarget(key)}
              onRotate={() =>
                updateMutation.mutate({ action: 'rotate', keyId: key.id })
              }
            />
          ))}
          {!keysQuery.isPending && keys.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
              {t('empty')}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <SecretDialog onClose={() => setSecret(null)} value={secret} />
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

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function KeyRow({
  approvalGranted,
  isPending,
  keyRecord,
  onRevoke,
  onRotate,
}: {
  approvalGranted: boolean;
  isPending: boolean;
  keyRecord: AiStudioApiKey;
  onRevoke: () => void;
  onRotate: () => void;
}) {
  const t = useTranslations('ai-studio.keys');
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
      <KeyRound className="size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{keyRecord.name}</div>
        <div className="font-mono text-muted-foreground text-xs">
          {keyRecord.prefix} · {keyRecord.environment}
        </div>
      </div>
      <Badge variant="outline">
        {keyRecord.revoked_at ? t('revoked') : t('active')}
      </Badge>
      {!keyRecord.revoked_at ? (
        <div className="flex gap-2">
          <Button
            disabled={!approvalGranted || isPending}
            onClick={onRotate}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="mr-2 size-3.5" />
            {t('rotate')}
          </Button>
          <Button
            disabled={isPending}
            onClick={onRevoke}
            size="sm"
            variant="outline"
          >
            <Trash2 className="mr-2 size-3.5" />
            {t('revoke')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SecretDialog({
  onClose,
  value,
}: {
  onClose: () => void;
  value: AiStudioKeySecretResponse | null;
}) {
  const t = useTranslations('ai-studio.keys');
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(value)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('secret_title')}</DialogTitle>
          <DialogDescription>{t('secret_description')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={value?.secret ?? ''} />
          <Button
            onClick={async () => {
              if (value?.secret) {
                await navigator.clipboard.writeText(value.secret);
                toast.success(t('copied'));
              }
            }}
            size="icon"
            variant="outline"
          >
            <Copy className="size-4" />
            <span className="sr-only">{t('copy')}</span>
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
