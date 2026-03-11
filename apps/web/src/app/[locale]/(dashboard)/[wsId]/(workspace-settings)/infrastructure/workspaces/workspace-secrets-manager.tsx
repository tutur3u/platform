'use client';

import { Calendar, Loader2, Plus, ShieldAlert, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn, formatBytes, formatDuration } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  isRateLimitSecretName,
  NON_RATE_LIMIT_SECRETS,
} from '../../secrets/constants';
import SecretForm from '../../secrets/form';
import {
  useDeleteWorkspaceSecret,
  useUpsertWorkspaceSecret,
  useWorkspaceSecrets,
} from './workspace-secrets-data';

interface Props {
  workspaceId: string;
}

function getKnownSecret(name: string | null | undefined) {
  return NON_RATE_LIMIT_SECRETS.find((secret) => secret.name === name);
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

  return <span className="break-all font-mono text-sm">{value || '—'}</span>;
}

export function WorkspaceSecretsManager({ workspaceId }: Props) {
  const t = useTranslations('ws-overview');
  const tCommon = useTranslations('common');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null);
  const {
    data: secrets = [],
    error,
    isLoading,
    isFetching,
  } = useWorkspaceSecrets(workspaceId);
  const deleteMutation = useDeleteWorkspaceSecret(workspaceId);
  const saveMutation = useUpsertWorkspaceSecret(workspaceId);

  const scopedSecrets = secrets.filter(
    (secret) => !isRateLimitSecretName(secret.name)
  );
  const existingSecretNames = scopedSecrets
    .filter((secret) => !!secret.name)
    .map((secret) => secret.name as string);
  const booleanSecretCount = scopedSecrets.filter(
    (secret) => secret.value === 'true' || secret.value === 'false'
  ).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="h-fit border-border/80 bg-background/80 xl:sticky xl:top-4">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{t('detail_tab_secrets')}</CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('secret_manager_description')}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-foreground/5 p-3">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {t('secret_manager_total')}
              </div>
              <div className="mt-2 font-semibold text-2xl">
                {scopedSecrets.length}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-foreground/5 p-3">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {t('secret_manager_flags')}
              </div>
              <div className="mt-2 font-semibold text-2xl">
                {booleanSecretCount}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {showCreateForm ? (
            <div className="rounded-lg border border-border border-dashed bg-background p-4">
              <SecretForm
                wsId={workspaceId}
                existingSecrets={existingSecretNames}
                secretScope="non-rate-limits"
                onSubmitSecret={(payload) => saveMutation.mutateAsync(payload)}
                onFinish={() => {
                  setShowCreateForm(false);
                }}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border border-dashed bg-foreground/5 p-4 text-sm">
              <p className="font-medium">
                {t('secret_manager_add_hint_title')}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t('secret_manager_add_hint_description')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-xl border border-border bg-foreground/5"
            />
          ))
        ) : error ? (
          <div className="rounded-xl border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
            {error instanceof Error
              ? error.message
              : t('secret_manager_load_error')}
          </div>
        ) : scopedSecrets.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed bg-background/60 p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-yellow/10 text-dynamic-yellow">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <p className="font-medium text-sm">
              {t('secret_manager_empty_title')}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('secret_manager_empty_description')}
            </p>
          </div>
        ) : (
          scopedSecrets.map((secret) => {
            const definition = getKnownSecret(secret.name);
            const secretId = secret.id ?? null;
            const isEditing = editingSecretId === secret.id;

            return (
              <Card
                key={secret.id}
                className={cn(
                  'border-border/80 bg-background/80 transition-opacity',
                  isFetching && 'opacity-70'
                )}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-base">
                          {secret.name || t('secret_manager_unnamed')}
                        </span>
                        {definition?.type === 'boolean' && (
                          <Badge variant="outline">
                            {t('secret_manager_flag_badge')}
                          </Badge>
                        )}
                      </div>

                      {definition?.description && (
                        <p className="max-w-3xl text-muted-foreground text-sm">
                          {definition.description}
                        </p>
                      )}

                      <div className="rounded-lg bg-foreground/5 p-4">
                        {renderSecretValue(secret)}
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {t('secret_manager_created_at', {
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
                        secretScope="non-rate-limits"
                        onSubmitSecret={(payload) =>
                          saveMutation.mutateAsync(payload)
                        }
                        onFinish={() => {
                          setEditingSecretId(null);
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
