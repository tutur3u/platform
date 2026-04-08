'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Cloud,
  Database,
  LoaderCircle,
  Package,
} from '@tuturuuu/icons';
import { migrateWorkspaceStorage } from '@tuturuuu/internal-api';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  DRIVE_STORAGE_PROVIDER_SECRET,
  WORKSPACE_STORAGE_AUTO_EXTRACT_SECRET_DEFINITIONS,
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SECRET_DEFINITIONS,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from '@/lib/workspace-storage-config';
import { formatBytes } from '@/utils/file-helper';
import SecretForm from './form';

interface BackendState {
  provider: WorkspaceStorageProvider;
  available: boolean;
  selected: boolean;
  misconfigured: boolean;
  message?: string;
  overview?: {
    provider: WorkspaceStorageProvider;
    totalSize: number;
    fileCount: number;
  };
}

interface RolloutState {
  activeProvider: WorkspaceStorageProvider;
  activeProviderMisconfigured: boolean;
  backends: Record<WorkspaceStorageProvider, BackendState>;
  autoExtract: {
    enabled: boolean;
    configured: boolean;
    proxyUrlConfigured: boolean;
    proxyTokenConfigured: boolean;
  };
}

interface StorageRolloutPanelProps {
  wsId: string;
  secrets: WorkspaceSecret[];
  rolloutState: RolloutState;
}

function formatSecretValue(secret?: WorkspaceSecret, sensitive?: boolean) {
  if (!secret?.value) {
    return null;
  }

  if (sensitive) {
    return '••••••••';
  }

  return secret.value;
}

function getRecommendedMigration(activeProvider: WorkspaceStorageProvider): {
  sourceProvider: WorkspaceStorageProvider;
  targetProvider: WorkspaceStorageProvider;
} {
  return activeProvider === WORKSPACE_STORAGE_PROVIDER_R2
    ? {
        sourceProvider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
        targetProvider: WORKSPACE_STORAGE_PROVIDER_R2,
      }
    : {
        sourceProvider: WORKSPACE_STORAGE_PROVIDER_R2,
        targetProvider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      };
}

function SecretQuickCard({
  addLabel,
  configured,
  description,
  editLabel,
  label,
  missingLabel,
  noValueLabel,
  onClick,
  optionalLabel,
  readyLabel,
  required,
  requiredLabel,
  value,
}: {
  addLabel: string;
  configured: boolean;
  description: string;
  editLabel: string;
  label: string;
  missingLabel: string;
  noValueLabel: string;
  onClick: () => void;
  optionalLabel: string;
  readyLabel: string;
  required: boolean;
  requiredLabel: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-dynamic-border bg-background/80 p-4 shadow-black/5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium text-sm">{label}</div>
          <p className="text-muted-foreground text-xs leading-5">
            {description}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 font-medium text-[11px] ${
            configured
              ? 'bg-dynamic-green/10 text-dynamic-green'
              : 'bg-dynamic-orange/10 text-dynamic-orange'
          }`}
        >
          {configured ? readyLabel : missingLabel}
        </span>
      </div>
      <div className="mt-4 rounded-xl border border-dynamic-border/70 bg-muted/35 px-3 py-2 font-mono text-xs">
        {value || noValueLabel}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {required ? requiredLabel : optionalLabel}
        </span>
        <Button
          size="sm"
          variant={configured ? 'outline' : 'default'}
          onClick={onClick}
        >
          {configured ? editLabel : addLabel}
        </Button>
      </div>
    </div>
  );
}

function BackendOverviewCard({
  active,
  available,
  description,
  fileCount,
  inventoryLabel,
  message,
  missingBackendMessage,
  objectsLabel,
  onMigrate,
  providerLabel,
  reachableLabel,
  statusActiveLabel,
  unavailableLabel,
  useBackendLabel,
  provider,
  readyBackendMessage,
  needsSecretsLabel,
  selected,
  totalSize,
}: {
  active: boolean;
  available: boolean;
  description: string;
  fileCount?: number;
  inventoryLabel: string;
  message?: string;
  missingBackendMessage: string;
  objectsLabel: string;
  onMigrate: () => void;
  providerLabel: string;
  reachableLabel: string;
  statusActiveLabel: string;
  unavailableLabel: string;
  useBackendLabel: string;
  provider: WorkspaceStorageProvider;
  readyBackendMessage: string;
  needsSecretsLabel: string;
  selected: boolean;
  totalSize?: number;
}) {
  const Icon = provider === WORKSPACE_STORAGE_PROVIDER_R2 ? Cloud : Database;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-5 ${
        active
          ? 'border-dynamic-blue/40 bg-linear-to-br from-dynamic-blue/10 via-background to-background'
          : 'border-dynamic-border bg-card'
      }`}
    >
      <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-dynamic-blue/8 blur-2xl" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-dynamic-border bg-background/80 p-3">
              <Icon className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <div className="font-semibold text-base">{providerLabel}</div>
              <p className="text-muted-foreground text-xs leading-5">
                {description}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 font-medium text-[11px]">
            {selected ? (
              <span className="rounded-full bg-dynamic-blue/10 px-2 py-1 text-dynamic-blue">
                {statusActiveLabel}
              </span>
            ) : null}
            <span
              className={`rounded-full px-2 py-1 ${
                available
                  ? 'bg-dynamic-green/10 text-dynamic-green'
                  : 'bg-dynamic-orange/10 text-dynamic-orange'
              }`}
            >
              {available ? reachableLabel : needsSecretsLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-dynamic-border/70 bg-background/80 p-4">
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
              {objectsLabel}
            </div>
            <div className="mt-2 font-semibold text-2xl">
              {available ? (fileCount ?? 0) : '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-dynamic-border/70 bg-background/80 p-4">
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
              {inventoryLabel}
            </div>
            <div className="mt-2 font-semibold text-lg">
              {available ? formatBytes(totalSize ?? 0) : unavailableLabel}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-dynamic-border/70 bg-muted/25 p-4 text-sm leading-6">
          {message || (available ? readyBackendMessage : missingBackendMessage)}
        </div>

        <Button
          type="button"
          variant={selected ? 'outline' : 'default'}
          className="w-full justify-between"
          onClick={onMigrate}
          disabled={!available}
        >
          <span>{useBackendLabel}</span>
          <ArrowRightLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function StorageRolloutPanel({
  wsId,
  secrets,
  rolloutState,
}: StorageRolloutPanelProps) {
  const t = useTranslations('ws-secrets');
  const router = useRouter();
  const providerLabels = {
    [WORKSPACE_STORAGE_PROVIDER_SUPABASE]: t('rollout.providers.supabase'),
    [WORKSPACE_STORAGE_PROVIDER_R2]: t('rollout.providers.r2'),
  } as const;
  const [activeSecretName, setActiveSecretName] = useState<string | null>(null);
  const secretMap = useMemo(
    () =>
      new Map(
        secrets
          .filter((secret) => !!secret.name)
          .map((secret) => [secret.name!, secret])
      ),
    [secrets]
  );
  const providerSecret = secretMap.get(DRIVE_STORAGE_PROVIDER_SECRET);
  const activeProvider =
    (providerSecret?.value as WorkspaceStorageProvider | undefined) ||
    rolloutState.activeProvider ||
    WORKSPACE_STORAGE_PROVIDER_SUPABASE;
  const recommendedMigration = getRecommendedMigration(activeProvider);

  const migrationMutation = useMutation({
    mutationFn: async (payload: {
      sourceProvider: WorkspaceStorageProvider;
      targetProvider: WorkspaceStorageProvider;
    }) =>
      migrateWorkspaceStorage(wsId, {
        ...payload,
        overwrite: true,
      }),
    onSuccess: (result) => {
      toast.success(
        t('rollout.migration_success', {
          files: result.filesCopied,
          target: providerLabels[result.targetProvider],
        })
      );
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('rollout.migration_error')
      );
    },
  });

  const providerSecrets = WORKSPACE_STORAGE_PROVIDER_SECRET_DEFINITIONS.map(
    (definition) => ({
      definition,
      secret: secretMap.get(definition.name),
    })
  );
  const automationSecrets =
    WORKSPACE_STORAGE_AUTO_EXTRACT_SECRET_DEFINITIONS.map((definition) => ({
      definition,
      secret: secretMap.get(definition.name),
    }));
  const activeSecret = [...providerSecrets, ...automationSecrets].find(
    (entry) => entry.definition.name === activeSecretName
  );
  const providerRequiredCount = providerSecrets.filter(
    (entry) => entry.definition.rolloutRequired
  ).length;
  const providerConfiguredCount = providerSecrets.filter(
    (entry) => entry.definition.rolloutRequired && !!entry.secret?.value
  ).length;

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-[28px] border border-dynamic-border bg-linear-to-br from-background via-background to-dynamic-blue/5">
        <div className="border-dynamic-border/70 border-b px-6 py-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex items-center gap-2 text-dynamic-blue text-xs uppercase tracking-[0.24em]">
                <Package className="h-4 w-4" />
                {t('rollout.console')}
              </div>
              <div className="space-y-2">
                <h2 className="font-semibold text-2xl tracking-tight">
                  {t('rollout.title')}
                </h2>
                <p className="text-muted-foreground text-sm leading-6">
                  {t('rollout.description')}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-dynamic-border bg-background/80 px-4 py-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                  {t('rollout.metrics.active_backend')}
                </div>
                <div className="mt-2 font-semibold text-base">
                  {providerLabels[activeProvider]}
                </div>
              </div>
              <div className="rounded-2xl border border-dynamic-border bg-background/80 px-4 py-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                  {t('rollout.metrics.provider_secrets')}
                </div>
                <div className="mt-2 font-semibold text-base">
                  {providerConfiguredCount}/{providerRequiredCount}
                </div>
              </div>
              <div className="rounded-2xl border border-dynamic-border bg-background/80 px-4 py-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                  {t('rollout.metrics.zip_automation')}
                </div>
                <div className="mt-2 font-semibold text-base">
                  {rolloutState.autoExtract.enabled
                    ? rolloutState.autoExtract.configured
                      ? t('rollout.states.enabled')
                      : t('rollout.states.needs_proxy_secrets')
                    : t('rollout.states.disabled')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:px-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <BackendOverviewCard
                active={
                  recommendedMigration.targetProvider ===
                  WORKSPACE_STORAGE_PROVIDER_SUPABASE
                }
                available={rolloutState.backends.supabase.available}
                description={t('rollout.backends.supabase.description')}
                fileCount={rolloutState.backends.supabase.overview?.fileCount}
                inventoryLabel={t('rollout.backends.inventory')}
                message={rolloutState.backends.supabase.message}
                missingBackendMessage={t('rollout.backends.missing_message')}
                objectsLabel={t('rollout.backends.objects')}
                provider={WORKSPACE_STORAGE_PROVIDER_SUPABASE}
                providerLabel={
                  providerLabels[WORKSPACE_STORAGE_PROVIDER_SUPABASE]
                }
                reachableLabel={t('rollout.backends.reachable')}
                statusActiveLabel={t('rollout.backends.active')}
                unavailableLabel={t('rollout.backends.unavailable')}
                useBackendLabel={t('rollout.backends.copy_into', {
                  provider: providerLabels[WORKSPACE_STORAGE_PROVIDER_SUPABASE],
                })}
                readyBackendMessage={t('rollout.backends.ready_message')}
                needsSecretsLabel={t('rollout.backends.needs_secrets')}
                selected={rolloutState.backends.supabase.selected}
                totalSize={rolloutState.backends.supabase.overview?.totalSize}
                onMigrate={() =>
                  migrationMutation.mutate({
                    sourceProvider: WORKSPACE_STORAGE_PROVIDER_R2,
                    targetProvider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
                  })
                }
              />
              <BackendOverviewCard
                active={
                  recommendedMigration.targetProvider ===
                  WORKSPACE_STORAGE_PROVIDER_R2
                }
                available={rolloutState.backends.r2.available}
                description={t('rollout.backends.r2.description')}
                fileCount={rolloutState.backends.r2.overview?.fileCount}
                inventoryLabel={t('rollout.backends.inventory')}
                message={rolloutState.backends.r2.message}
                missingBackendMessage={t('rollout.backends.missing_message')}
                objectsLabel={t('rollout.backends.objects')}
                provider={WORKSPACE_STORAGE_PROVIDER_R2}
                providerLabel={providerLabels[WORKSPACE_STORAGE_PROVIDER_R2]}
                reachableLabel={t('rollout.backends.reachable')}
                statusActiveLabel={t('rollout.backends.active')}
                unavailableLabel={t('rollout.backends.unavailable')}
                useBackendLabel={t('rollout.backends.copy_into', {
                  provider: providerLabels[WORKSPACE_STORAGE_PROVIDER_R2],
                })}
                readyBackendMessage={t('rollout.backends.ready_message')}
                needsSecretsLabel={t('rollout.backends.needs_secrets')}
                selected={rolloutState.backends.r2.selected}
                totalSize={rolloutState.backends.r2.overview?.totalSize}
                onMigrate={() =>
                  migrationMutation.mutate({
                    sourceProvider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
                    targetProvider: WORKSPACE_STORAGE_PROVIDER_R2,
                  })
                }
              />
            </div>

            <div className="rounded-3xl border border-dynamic-border bg-card p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-semibold text-lg">
                    {t('rollout.migration.title')}
                  </div>
                  <p className="text-muted-foreground text-sm leading-6">
                    {t('rollout.migration.description')}
                  </p>
                </div>
                <span className="rounded-full bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
                  {t('rollout.migration.recommended', {
                    source: providerLabels[recommendedMigration.sourceProvider],
                    target: providerLabels[recommendedMigration.targetProvider],
                  })}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="justify-between rounded-2xl"
                  onClick={() =>
                    migrationMutation.mutate({
                      sourceProvider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
                      targetProvider: WORKSPACE_STORAGE_PROVIDER_R2,
                    })
                  }
                  disabled={
                    migrationMutation.isPending ||
                    !rolloutState.backends.supabase.available ||
                    !rolloutState.backends.r2.available
                  }
                >
                  <span>{t('rollout.migration.supabase_to_r2')}</span>
                  {migrationMutation.isPending &&
                  migrationMutation.variables?.targetProvider ===
                    WORKSPACE_STORAGE_PROVIDER_R2 ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="justify-between rounded-2xl"
                  onClick={() =>
                    migrationMutation.mutate({
                      sourceProvider: WORKSPACE_STORAGE_PROVIDER_R2,
                      targetProvider: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
                    })
                  }
                  disabled={
                    migrationMutation.isPending ||
                    !rolloutState.backends.supabase.available ||
                    !rolloutState.backends.r2.available
                  }
                >
                  <span>{t('rollout.migration.r2_to_supabase')}</span>
                  {migrationMutation.isPending &&
                  migrationMutation.variables?.targetProvider ===
                    WORKSPACE_STORAGE_PROVIDER_SUPABASE ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-dynamic-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-lg">
                    {t('rollout.auto_extract.title')}
                  </div>
                  <p className="mt-1 text-muted-foreground text-sm leading-6">
                    {t('rollout.auto_extract.description')}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-medium text-xs ${
                    rolloutState.autoExtract.enabled
                      ? rolloutState.autoExtract.configured
                        ? 'bg-dynamic-green/10 text-dynamic-green'
                        : 'bg-dynamic-orange/10 text-dynamic-orange'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {rolloutState.autoExtract.enabled
                    ? rolloutState.autoExtract.configured
                      ? t('rollout.auto_extract.live')
                      : t('rollout.auto_extract.blocked')
                    : t('rollout.auto_extract.off')}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-dynamic-border/70 bg-background/80 px-4 py-3">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                    {t('rollout.auto_extract.switch')}
                  </div>
                  <div className="mt-2 font-semibold text-sm">
                    {rolloutState.autoExtract.enabled
                      ? t('rollout.states.enabled')
                      : t('rollout.states.disabled')}
                  </div>
                </div>
                <div className="rounded-2xl border border-dynamic-border/70 bg-background/80 px-4 py-3">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                    {t('rollout.auto_extract.proxy_url')}
                  </div>
                  <div className="mt-2 font-semibold text-sm">
                    {rolloutState.autoExtract.proxyUrlConfigured
                      ? t('rollout.states.present')
                      : t('rollout.states.missing')}
                  </div>
                </div>
                <div className="rounded-2xl border border-dynamic-border/70 bg-background/80 px-4 py-3">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                    {t('rollout.auto_extract.shared_token')}
                  </div>
                  <div className="mt-2 font-semibold text-sm">
                    {rolloutState.autoExtract.proxyTokenConfigured
                      ? t('rollout.states.present')
                      : t('rollout.states.missing')}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-dynamic-border bg-card p-5">
              <div className="font-semibold text-lg">
                {t('rollout.provider_secrets.title')}
              </div>
              <div className="mt-4 grid gap-3">
                {providerSecrets.map(({ definition, secret }) => (
                  <SecretQuickCard
                    addLabel={t('rollout.add')}
                    key={definition.name}
                    configured={!!secret?.value}
                    description={definition.description}
                    editLabel={t('rollout.edit')}
                    label={definition.name}
                    missingLabel={t('rollout.missing')}
                    noValueLabel={t('rollout.no_value')}
                    onClick={() => setActiveSecretName(definition.name)}
                    optionalLabel={t('rollout.optional')}
                    readyLabel={t('rollout.configured')}
                    required={!!definition.rolloutRequired}
                    requiredLabel={t('rollout.required')}
                    value={formatSecretValue(secret, definition.sensitive)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-dynamic-border bg-card p-5">
              <div className="font-semibold text-lg">
                {t('rollout.proxy_secrets.title')}
              </div>
              <p className="mt-1 text-muted-foreground text-sm leading-6">
                {t('rollout.proxy_secrets.description')}
              </p>
              <div className="mt-4 grid gap-3">
                {automationSecrets.map(({ definition, secret }) => (
                  <SecretQuickCard
                    addLabel={t('rollout.add')}
                    key={definition.name}
                    configured={!!secret?.value}
                    description={definition.description}
                    editLabel={t('rollout.edit')}
                    label={definition.name}
                    missingLabel={t('rollout.missing')}
                    noValueLabel={t('rollout.no_value')}
                    onClick={() => setActiveSecretName(definition.name)}
                    optionalLabel={t('rollout.optional')}
                    readyLabel={t('rollout.configured')}
                    required={false}
                    requiredLabel={t('rollout.required')}
                    value={formatSecretValue(secret, definition.sensitive)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {activeSecret ? (
        <ModifiableDialogTrigger
          open={true}
          setOpen={(open) => {
            if (!open) {
              setActiveSecretName(null);
            }
          }}
          title={
            activeSecret.secret
              ? t('rollout.dialog_update')
              : t('rollout.dialog_add')
          }
          form={
            <SecretForm
              wsId={wsId}
              data={activeSecret.secret}
              existingSecrets={secrets
                .filter((secret) => !!secret.name)
                .map((secret) => secret.name!)}
              initialValues={{
                name: activeSecret.definition.name,
                value:
                  activeSecret.secret?.value ||
                  activeSecret.definition.defaultValue ||
                  '',
              }}
              nameLocked={true}
            />
          }
        />
      ) : null}
    </>
  );
}
