'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Loader2, Plus, ShieldAlert, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn, formatBytes, formatDuration } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { KNOWN_SECRETS } from '../../secrets/constants';
import SecretForm from '../../secrets/form';

type SecretManagerMode = 'all' | 'rate-limits';

interface Props {
  workspaceId: string;
  mode: SecretManagerMode;
}

function isRateLimitSecret(secret: WorkspaceSecret) {
  return secret.name?.includes('RATE_LIMIT');
}

function getKnownSecret(name: string | null | undefined) {
  return KNOWN_SECRETS.find((secret) => secret.name === name);
}

function renderSecretValue(secret: WorkspaceSecret) {
  const value = secret.value || '';
  const definition = getKnownSecret(secret.name);

  if (value === 'true' || value === 'false') {
    return (
      <Badge variant={value === 'true' ? 'default' : 'secondary'}>
        {value}
      </Badge>
    );
  }

  if (definition?.type === 'bytes' && value && Number.isFinite(Number(value))) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{formatBytes(Number(value))}</span>
        <span className="font-mono text-muted-foreground text-xs">{value}</span>
      </div>
    );
  }

  if (
    definition?.type === 'duration_ms' &&
    value &&
    Number.isFinite(Number(value))
  ) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {formatDuration(Number(value) / 1000)}
        </span>
        <span className="font-mono text-muted-foreground text-xs">
          {value} ms
        </span>
      </div>
    );
  }

  return <span className="font-mono text-sm">{value || '—'}</span>;
}

export function WorkspaceSecretsManager({ workspaceId, mode }: Props) {
  const t = useTranslations('ws-overview');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null);

  const queryKey = ['workspace-secrets', workspaceId];

  const {
    data: secrets = [],
    error,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/secrets`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || t('secret_manager_load_error'));
      }

      return (await res.json()) as WorkspaceSecret[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (secret: WorkspaceSecret) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/secrets/${secret.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || t('secret_manager_delete_error'));
      }
    },
    onSuccess: async (_, secret) => {
      if (editingSecretId === secret.id) {
        setEditingSecretId(null);
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        secret.name
          ? t('secret_manager_deleted_named', { name: secret.name })
          : t('secret_manager_deleted')
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t('secret_manager_delete_error')
      );
    },
  });

  const filteredSecrets = secrets.filter((secret) =>
    mode === 'rate-limits' ? isRateLimitSecret(secret) : true
  );

  const existingSecretNames = secrets
    .filter((secret) => !!secret.name)
    .map((secret) => secret.name as string);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/80 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="font-medium text-sm">
              {mode === 'rate-limits'
                ? t('detail_tab_rate_limits')
                : t('detail_tab_secrets')}
            </h4>
            <p className="text-muted-foreground text-sm">
              {mode === 'rate-limits'
                ? t('rate_limit_manager_description')
                : t('secret_manager_description')}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setShowCreateForm((current) => !current);
              setEditingSecretId(null);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('secret_manager_add')}
          </Button>
        </div>

        {showCreateForm && (
          <div className="rounded-lg border border-border border-dashed bg-background p-4">
            <SecretForm
              wsId={workspaceId}
              existingSecrets={existingSecretNames}
              onFinish={async () => {
                setShowCreateForm(false);
                await queryClient.invalidateQueries({ queryKey });
              }}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-lg border border-border bg-foreground/5"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
          {error instanceof Error
            ? error.message
            : t('secret_manager_load_error')}
        </div>
      ) : filteredSecrets.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-background/60 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-yellow/10 text-dynamic-yellow">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <p className="font-medium text-sm">
            {mode === 'rate-limits'
              ? t('rate_limit_manager_empty_title')
              : t('secret_manager_empty_title')}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {mode === 'rate-limits'
              ? t('rate_limit_manager_empty_description')
              : t('secret_manager_empty_description')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSecrets.map((secret) => {
            const definition = getKnownSecret(secret.name);
            const secretId = secret.id ?? null;
            const isEditing = editingSecretId === secret.id;

            return (
              <div
                key={secret.id}
                className={cn(
                  'rounded-lg border border-border bg-background/80 p-4 transition-opacity',
                  isFetching && 'opacity-70'
                )}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {secret.name || t('secret_manager_unnamed')}
                      </span>
                      {isRateLimitSecret(secret) && (
                        <Badge variant="outline">
                          {t('secret_manager_rate_limit_badge')}
                        </Badge>
                      )}
                    </div>
                    {definition?.description && (
                      <p className="text-muted-foreground text-sm">
                        {definition.description}
                      </p>
                    )}
                    <div className="rounded-md bg-foreground/5 p-3">
                      {renderSecretValue(secret)}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {t('secret_manager_updated_at', {
                          date: moment(secret.created_at).format(
                            'MMM DD, YYYY HH:mm'
                          ),
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!secretId) return;
                        setShowCreateForm(false);
                        setEditingSecretId((current) =>
                          current === secretId ? null : secretId
                        );
                      }}
                    >
                      {tCommon('edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-dynamic-red hover:text-dynamic-red"
                      aria-label={tCommon('delete')}
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(secret)}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 rounded-lg border border-border border-dashed bg-background p-4">
                    <SecretForm
                      wsId={workspaceId}
                      data={secret}
                      existingSecrets={existingSecretNames}
                      onFinish={async () => {
                        setEditingSecretId(null);
                        await queryClient.invalidateQueries({ queryKey });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
