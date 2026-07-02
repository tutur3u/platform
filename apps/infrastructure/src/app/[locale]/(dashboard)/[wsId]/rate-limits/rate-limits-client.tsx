'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Gauge,
  Infinity as InfinityIcon,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from '@tuturuuu/icons';
import {
  type CreateRateLimitRulePayload,
  createRateLimitRule,
  getRateLimitRules,
  listRateLimitAppeals,
  type RateLimitAbuseProtectionControls,
  revokeRateLimitRule,
  type UpdateRateLimitAbuseProtectionControlsPayload,
  updateRateLimitAbuseProtectionControls,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import {
  ABUSE_REPUTATION_SUBJECT_TYPES,
  type AbuseReputationSubjectType,
} from '@tuturuuu/utils/abuse-protection';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { LiveUsageTable } from './live-usage-table';
import { formatDateTime } from './rate-limits-format';
import { RateLimitRuleDialog } from './rule-controls';
import { RateLimitRulesTable } from './rules-table';
import { WorkspaceSecretsControls } from './workspace-secrets-controls';

const QUERY_KEY = ['infrastructure', 'rate-limits'];
const ALL_SUBJECTS = 'all';

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        {icon}
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
    </div>
  );
}

function ProtectionControlRow({
  checked,
  description,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onToggle: (checked: boolean) => void;
}) {
  const statusIcon = checked ? (
    <ShieldCheck className="h-5 w-5 text-dynamic-green" />
  ) : (
    <ShieldOff className="h-5 w-5 text-dynamic-red" />
  );

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 shrink-0">{statusIcon}</div>
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

function AbuseProtectionControlsCard({
  canManage,
  controls,
  isSaving,
  onUpdate,
}: {
  canManage: boolean;
  controls: RateLimitAbuseProtectionControls;
  isSaving: boolean;
  onUpdate: (payload: UpdateRateLimitAbuseProtectionControlsPayload) => void;
}) {
  const t = useTranslations('rate-limits');
  const disabled = !canManage || isSaving;
  const lastUpdated = controls.updatedAt
    ? t('controls.updated', {
        updated: formatDateTime(controls.updatedAt),
      })
    : t('controls.never_updated');

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-xl">{t('controls.title')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('controls.description')}
          </p>
        </div>
        <p className="text-muted-foreground text-sm">{lastUpdated}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ProtectionControlRow
          checked={controls.ipBlockingEnabled}
          description={t('controls.ip_blocking_description')}
          disabled={disabled}
          label={t('controls.ip_blocking')}
          onToggle={(ipBlockingEnabled) => onUpdate({ ipBlockingEnabled })}
        />
        <ProtectionControlRow
          checked={controls.rateLimitsEnabled}
          description={t('controls.rate_limits_description')}
          disabled={disabled}
          label={t('controls.rate_limits')}
          onToggle={(rateLimitsEnabled) => onUpdate({ rateLimitsEnabled })}
        />
      </div>
      {!canManage ? (
        <p className="mt-3 text-muted-foreground text-sm">
          {t('controls.read_only')}
        </p>
      ) : null}
    </section>
  );
}

export function RateLimitsClient({
  canManage,
  wsId,
}: {
  canManage: boolean;
  wsId: string;
}) {
  const t = useTranslations('rate-limits');
  const queryClient = useQueryClient();
  const [subjectType, setSubjectType] = useState<string>(ALL_SUBJECTS);
  const [search, setSearch] = useState('');

  const rulesQuery = useQuery({
    queryFn: () =>
      getRateLimitRules({
        limit: 200,
        q: search.trim() || undefined,
        subjectType:
          subjectType === ALL_SUBJECTS
            ? undefined
            : (subjectType as AbuseReputationSubjectType),
      }),
    queryKey: [...QUERY_KEY, subjectType, search.trim()],
    refetchInterval: 15000,
    staleTime: 5000,
  });
  const appealsQuery = useQuery({
    queryFn: () => listRateLimitAppeals({ limit: 1, status: 'pending' }),
    queryKey: ['infrastructure', 'rate-limit-appeals', 'pending-summary'],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateRateLimitRulePayload) =>
      createRateLimitRule(payload),
    onError: () => toast.error(t('toasts.rule_create_failed')),
    onSuccess: () => {
      toast.success(t('toasts.rule_created'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (ruleId: string) =>
      revokeRateLimitRule(ruleId, { reason: t('rules.revoke_reason') }),
    onError: () => toast.error(t('toasts.rule_revoke_failed')),
    onSuccess: () => {
      toast.success(t('toasts.rule_revoked'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const updateControlsMutation = useMutation({
    mutationFn: (payload: UpdateRateLimitAbuseProtectionControlsPayload) =>
      updateRateLimitAbuseProtectionControls(payload),
    onError: () => toast.error(t('toasts.controls_update_failed')),
    onSuccess: () => {
      toast.success(t('toasts.controls_updated'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  if (rulesQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rulesQuery.isError || !rulesQuery.data) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">{t('error.title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('error.description')}
        </p>
        <Button onClick={() => rulesQuery.refetch()} variant="secondary">
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  const {
    abuseProtectionControls,
    edgeCachedSubjectKeys,
    rules,
    summary,
    writeBaseLimits,
  } = rulesQuery.data;
  const trustedWorkspaceRules = rules.filter(
    (rule) => rule.subject_type === 'workspace' && rule.tier === 'trusted'
  );
  const pendingAppeals = appealsQuery.data?.summary.pending ?? 0;

  return (
    <div className="space-y-6">
      <AbuseProtectionControlsCard
        canManage={canManage}
        controls={abuseProtectionControls}
        isSaving={updateControlsMutation.isPending}
        onUpdate={(payload) => updateControlsMutation.mutate(payload)}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Gauge className="h-5 w-5 text-primary" />}
          label={t('metrics.total')}
          value={summary.total}
        />
        <MetricCard
          icon={<InfinityIcon className="h-5 w-5 text-dynamic-green" />}
          label={t('metrics.unlimited')}
          value={summary.unlimitedCount}
        />
        <MetricCard
          icon={<Ban className="h-5 w-5 text-dynamic-red" />}
          label={t('metrics.blocked')}
          value={summary.blockedCount}
        />
        <MetricCard
          icon={<Gauge className="h-5 w-5 text-dynamic-blue" />}
          label={t('metrics.absolute')}
          value={summary.byMode.absolute ?? 0}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-xl">{t('review.title')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('review.description')}
              </p>
            </div>
            <Button asChild type="button" variant="outline">
              <Link href={`/${wsId}/rate-limit-appeals`}>
                {t('actions.open_appeals')}
              </Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <p className="text-muted-foreground text-sm">
                {t('review.pending_appeals')}
              </p>
              <p className="font-semibold text-2xl">{pendingAppeals}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-muted-foreground text-sm">
                {t('review.trusted_workspaces')}
              </p>
              <p className="font-semibold text-2xl">
                {trustedWorkspaceRules.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold text-xl">
            {t('sections.trusted_workspaces')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('sections.trusted_workspaces_description')}
          </p>
          <div className="mt-3 max-h-44 space-y-2 overflow-auto">
            {trustedWorkspaceRules.slice(0, 5).map((rule) => (
              <div className="rounded-md bg-muted/40 p-2" key={rule.id}>
                <p className="truncate font-medium text-sm">
                  {rule.subject?.label ?? rule.subject_key}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {t('review.trusted_rule_detail', {
                    expires: formatDateTime(rule.expires_at),
                    multiplier: rule.trust_multiplier,
                  })}
                </p>
              </div>
            ))}
            {trustedWorkspaceRules.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('empty.trusted_workspaces')}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-xl">{t('sections.rules')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('sections.rules_description')}
            </p>
          </div>
          {canManage ? (
            <RateLimitRuleDialog
              base={writeBaseLimits}
              isSubmitting={createMutation.isPending}
              onCreate={(payload) => createMutation.mutate(payload)}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Select onValueChange={setSubjectType} value={subjectType}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUBJECTS}>
                {t('filters.all_subjects')}
              </SelectItem>
              {ABUSE_REPUTATION_SUBJECT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`subject_types.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="sm:max-w-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('filters.search_subject')}
            value={search}
          />
        </div>

        <RateLimitRulesTable
          base={writeBaseLimits}
          canManage={canManage}
          edgeCachedSubjectKeys={edgeCachedSubjectKeys}
          isRevoking={revokeMutation.isPending}
          onRevoke={(ruleId) => revokeMutation.mutate(ruleId)}
          rules={rules}
        />
      </section>

      <Separator />

      <LiveUsageTable />

      <Separator />

      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer font-semibold text-xl">
          {t('sections.advanced_controls')}
        </summary>
        <p className="mt-2 text-muted-foreground text-sm">
          {t('sections.advanced_controls_description')}
        </p>
        <div className="mt-4">
          <WorkspaceSecretsControls canManage={canManage} />
        </div>
      </details>
    </div>
  );
}
