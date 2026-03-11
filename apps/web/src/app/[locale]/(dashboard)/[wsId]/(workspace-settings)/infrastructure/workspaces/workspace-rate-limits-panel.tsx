'use client';

import {
  Clock3,
  Gauge,
  Globe,
  Loader2,
  Mail,
  Minus,
  Plus,
  RefreshCcw,
  Save,
  Users,
} from '@tuturuuu/icons';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn, formatDuration } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  isRateLimitSecretName,
  RATE_LIMIT_SECRETS,
  type SecretDefinition,
} from '../../secrets/constants';
import {
  useDeleteWorkspaceSecret,
  useUpsertWorkspaceSecret,
  useWorkspaceSecrets,
} from './workspace-secrets-data';

type RateLimitEditorMode = 'number' | 'seconds';

type RateLimitDescriptionKey =
  | 'rate_limit_group_api_description'
  | 'rate_limit_group_email_description'
  | 'rate_limit_group_invites_description';

type RateLimitTitleKey =
  | 'rate_limit_group_api_title'
  | 'rate_limit_group_email_title'
  | 'rate_limit_group_invites_title';

type RateLimitGroup = {
  descriptionKey: RateLimitDescriptionKey;
  icon: ReactNode;
  items: Array<{
    name: string;
  }>;
  titleKey: RateLimitTitleKey;
};

const RATE_LIMIT_GROUPS: RateLimitGroup[] = [
  {
    titleKey: 'rate_limit_group_api_title',
    descriptionKey: 'rate_limit_group_api_description',
    icon: <Gauge className="h-4 w-4" />,
    items: [
      { name: 'RATE_LIMIT_WINDOW_MS' },
      { name: 'RATE_LIMIT_MAX_REQUESTS' },
      { name: 'RATE_LIMIT_UPLOAD_MAX_REQUESTS' },
      { name: 'RATE_LIMIT_UPLOAD_URL_MAX_REQUESTS' },
      { name: 'RATE_LIMIT_DOWNLOAD_MAX_REQUESTS' },
    ],
  },
  {
    titleKey: 'rate_limit_group_email_title',
    descriptionKey: 'rate_limit_group_email_description',
    icon: <Mail className="h-4 w-4" />,
    items: [
      { name: 'EMAIL_RATE_LIMIT_MINUTE' },
      { name: 'EMAIL_RATE_LIMIT_HOUR' },
      { name: 'EMAIL_RATE_LIMIT_DAY' },
      { name: 'EMAIL_RATE_LIMIT_USER_MINUTE' },
      { name: 'EMAIL_RATE_LIMIT_USER_HOUR' },
      { name: 'EMAIL_RATE_LIMIT_RECIPIENT_HOUR' },
      { name: 'EMAIL_RATE_LIMIT_RECIPIENT_DAY' },
      { name: 'EMAIL_RATE_LIMIT_IP_MINUTE' },
      { name: 'EMAIL_RATE_LIMIT_IP_HOUR' },
    ],
  },
  {
    titleKey: 'rate_limit_group_invites_title',
    descriptionKey: 'rate_limit_group_invites_description',
    icon: <Users className="h-4 w-4" />,
    items: [
      { name: 'INVITE_RATE_LIMIT_MINUTE' },
      { name: 'INVITE_RATE_LIMIT_HOUR' },
      { name: 'INVITE_RATE_LIMIT_DAY' },
    ],
  },
];

function getRateLimitDefinition(name: string) {
  return RATE_LIMIT_SECRETS.find((secret) => secret.name === name);
}

function getEditorMode(definition: SecretDefinition): RateLimitEditorMode {
  return definition.type === 'duration_ms' ? 'seconds' : 'number';
}

function getDisplayNumber(
  rawValue: string | null | undefined,
  mode: RateLimitEditorMode,
  fallbackValue: string | null | undefined
) {
  const numericValue = Number(rawValue || fallbackValue || '0');

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  if (mode === 'seconds') {
    return Math.max(1, Math.round(numericValue / 1000));
  }

  return numericValue;
}

function toStoredValue(value: number, mode: RateLimitEditorMode) {
  return mode === 'seconds' ? String(value * 1000) : String(value);
}

function formatRateLimitValue(
  definition: SecretDefinition,
  value: number,
  mode: RateLimitEditorMode
) {
  if (mode === 'seconds') {
    return `${value}s`;
  }

  if (definition.name.endsWith('_MINUTE')) return `${value}/min`;
  if (definition.name.endsWith('_HOUR')) return `${value}/hr`;
  if (definition.name.endsWith('_DAY')) return `${value}/day`;

  return value.toLocaleString();
}

function getStepValue(definition: SecretDefinition, mode: RateLimitEditorMode) {
  if (mode === 'seconds') {
    const defaultValue = Number(definition.defaultValue || '0');
    return defaultValue >= 300000 ? 30 : 5;
  }

  const baseline = Number(definition.defaultValue || '0');

  if (baseline >= 10000) return 500;
  if (baseline >= 1000) return 100;
  if (baseline >= 100) return 10;
  if (baseline >= 20) return 5;

  return 1;
}

function getMinValue(mode: RateLimitEditorMode) {
  return mode === 'seconds' ? 5 : 1;
}

function getGroupOverrideCount(
  group: RateLimitGroup,
  secrets: WorkspaceSecret[]
) {
  return group.items.filter((item) =>
    secrets.some((secret) => secret.name === item.name && secret.id)
  ).length;
}

function RateLimitEditorCard({
  definition,
  isResetting,
  isSaving,
  onReset,
  onSave,
  secret,
}: {
  definition: SecretDefinition;
  isResetting: boolean;
  isSaving: boolean;
  onReset: (secret: WorkspaceSecret) => void;
  onSave: (payload: { id?: string; name: string; value: string }) => void;
  secret?: WorkspaceSecret;
}) {
  const t = useTranslations('ws-overview');
  const mode = getEditorMode(definition);
  const defaultNumber = getDisplayNumber(
    undefined,
    mode,
    definition.defaultValue
  );
  const effectiveNumber = getDisplayNumber(
    secret?.value,
    mode,
    definition.defaultValue
  );
  const [draftValue, setDraftValue] = useState(effectiveNumber);

  useEffect(() => {
    setDraftValue(effectiveNumber);
  }, [effectiveNumber]);

  const hasOverride = !!secret?.id;
  const isDirty = draftValue !== effectiveNumber;
  const step = getStepValue(definition, mode);
  const minValue = getMinValue(mode);

  const saveDraft = () => {
    onSave({
      id: secret?.id,
      name: definition.name,
      value: toStoredValue(draftValue, mode),
    });
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-background/70 p-4 shadow-sm">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-sm">{definition.name}</h4>
              <Badge variant={hasOverride ? 'default' : 'secondary'}>
                {hasOverride
                  ? t('rate_limit_source_override')
                  : t('rate_limit_source_default')}
              </Badge>
            </div>
            <p className="max-w-xl text-muted-foreground text-sm">
              {definition.description}
            </p>
          </div>

          <div className="min-w-[132px] rounded-xl border border-border bg-foreground/5 px-3 py-2 text-right">
            <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {t('rate_limit_current')}
            </div>
            <div className="mt-1 font-semibold text-xl">
              {formatRateLimitValue(definition, effectiveNumber, mode)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-muted-foreground">
            {t('rate_limit_default_value', {
              value: formatRateLimitValue(definition, defaultNumber, mode),
            })}
          </div>
          <div className="rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-muted-foreground">
            {t('rate_limit_step', { value: step })}
          </div>
          {mode === 'seconds' && (
            <div className="rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-muted-foreground">
              {formatDuration(draftValue)}
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <label
              htmlFor={`rate-limit-${definition.name}`}
              className="font-medium text-sm"
            >
              {mode === 'seconds'
                ? t('rate_limit_input_seconds')
                : t('rate_limit_input_requests')}
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() =>
                  setDraftValue((current) => Math.max(minValue, current - step))
                }
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id={`rate-limit-${definition.name}`}
                type="number"
                min={minValue}
                step={step}
                value={draftValue}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);

                  if (!Number.isFinite(nextValue)) {
                    setDraftValue(minValue);
                    return;
                  }

                  setDraftValue(Math.max(minValue, Math.round(nextValue)));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && isDirty && !isSaving) {
                    event.preventDefault();
                    saveDraft();
                  }
                }}
                className="h-11 font-semibold text-base"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => setDraftValue((current) => current + step)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasOverride && (
              <Button
                type="button"
                variant="outline"
                disabled={isResetting}
                onClick={() => {
                  if (!secret) return;
                  onReset(secret);
                }}
              >
                {isResetting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                {t('rate_limit_reset')}
              </Button>
            )}
            <Button
              type="button"
              disabled={!isDirty || isSaving}
              onClick={saveDraft}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {hasOverride ? t('rate_limit_update') : t('rate_limit_apply')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceRateLimitsPanel({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useTranslations('ws-overview');
  const {
    data: secrets = [],
    error,
    isLoading,
    isFetching,
  } = useWorkspaceSecrets(workspaceId);
  const saveMutation = useUpsertWorkspaceSecret(workspaceId);
  const deleteMutation = useDeleteWorkspaceSecret(workspaceId);

  const scopedSecrets = secrets.filter((secret) =>
    isRateLimitSecretName(secret.name)
  );
  const totalRules = RATE_LIMIT_GROUPS.reduce(
    (count, group) => count + group.items.length,
    0
  );
  const overrideCount = scopedSecrets.length;
  const defaultCount = totalRules - overrideCount;

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-background/80">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <CardTitle>{t('detail_tab_rate_limits')}</CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('rate_limit_manager_description')}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-foreground/5 px-4 py-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {t('rate_limit_summary_overrides')}
                </div>
                <div className="mt-2 font-semibold text-2xl">
                  {overrideCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-foreground/5 px-4 py-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {t('rate_limit_summary_defaults')}
                </div>
                <div className="mt-2 font-semibold text-2xl">
                  {defaultCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-foreground/5 px-4 py-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {t('rate_limit_summary_rules')}
                </div>
                <div className="mt-2 font-semibold text-2xl">{totalRules}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{t('rate_limit_tip_window')}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('rate_limit_tip_window_description')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span>{t('rate_limit_tip_api')}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('rate_limit_tip_api_description')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{t('rate_limit_tip_email')}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t('rate_limit_tip_email_description')}
              </TooltipContent>
            </Tooltip>
          </div>

          {overrideCount === 0 && (
            <div className="rounded-2xl border border-border border-dashed bg-foreground/5 px-4 py-3 text-sm">
              <p className="font-medium">
                {t('rate_limit_manager_empty_title')}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t('rate_limit_manager_empty_description')}
              </p>
            </div>
          )}
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-xl border border-border bg-foreground/5"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
          {error instanceof Error
            ? error.message
            : t('secret_manager_load_error')}
        </div>
      ) : (
        <div className="space-y-5">
          {RATE_LIMIT_GROUPS.map((group) => {
            const overrideCountForGroup = getGroupOverrideCount(
              group,
              scopedSecrets
            );

            return (
              <Card
                key={group.titleKey}
                className={cn(
                  'border-border/80 bg-background/80 transition-opacity',
                  isFetching && 'opacity-70'
                )}
              >
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-foreground/80">
                        {group.icon}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {t(group.titleKey)}
                        </CardTitle>
                        <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
                          {t(group.descriptionKey)}
                        </p>
                      </div>
                    </div>

                    <Badge variant="outline" className="h-fit">
                      {t('rate_limit_group_overrides', {
                        count: overrideCountForGroup,
                        total: group.items.length,
                      })}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-2">
                  {group.items.map((item) => {
                    const definition = getRateLimitDefinition(item.name);

                    if (!definition) return null;

                    const secret = scopedSecrets.find(
                      (candidate) => candidate.name === item.name
                    );

                    return (
                      <RateLimitEditorCard
                        key={item.name}
                        definition={definition}
                        isSaving={
                          saveMutation.isPending &&
                          saveMutation.variables?.name === item.name
                        }
                        isResetting={
                          deleteMutation.isPending &&
                          deleteMutation.variables?.name === item.name
                        }
                        secret={secret}
                        onSave={(payload) => saveMutation.mutate(payload)}
                        onReset={(value) => deleteMutation.mutate(value)}
                      />
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
