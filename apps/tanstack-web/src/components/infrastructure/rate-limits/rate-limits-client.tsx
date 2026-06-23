'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Gauge, Infinity as InfinityIcon, Loader2 } from '@tuturuuu/icons';
import {
  type CreateRateLimitRulePayload,
  createRateLimitRule,
  getRateLimitRules,
  revokeRateLimitRule,
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
import {
  ABUSE_REPUTATION_SUBJECT_TYPES,
  type AbuseReputationSubjectType,
} from '@tuturuuu/utils/abuse-protection';
import { type ReactNode, useState } from 'react';
import { useTranslations } from 'use-intl';
import { LiveUsageTable } from './live-usage-table';
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

export function RateLimitsClient({ canManage }: { canManage: boolean }) {
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

  const { edgeCachedSubjectKeys, rules, summary, writeBaseLimits } =
    rulesQuery.data;

  return (
    <div className="space-y-6">
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

      <WorkspaceSecretsControls canManage={canManage} />
    </div>
  );
}
