'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Coins, TrendingDown, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

interface OverviewData {
  total_workspaces_with_balance: number;
  total_users_with_balance: number;
  total_credits_consumed: number;
  total_credits_allocated: number;
  total_bonus_credits: number;
  top_workspace_consumers: {
    ws_id: string;
    total_used: number;
    total_allocated: number;
    bonus_credits: number;
  }[];
  top_user_consumers: {
    user_id: string;
    total_used: number;
    total_allocated: number;
    bonus_credits: number;
  }[];
}

interface TransactionRow {
  id: string;
  created_at: string;
  transaction_type: string;
  amount: number | null;
  cost_usd: number | null;
  model_id: string | null;
  feature: string | null;
  ws_name: string | null;
  user_display_name: string | null;
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

export default function OverviewTab() {
  const t = useTranslations('ai-credits-admin');

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>(
    {
      queryKey: ['admin', 'ai-credits', 'overview'],
      queryFn: async () => {
        const res = await fetch('/api/v1/admin/ai-credits/overview');
        if (!res.ok) throw new Error('Failed to fetch overview');
        return res.json();
      },
    }
  );

  const { data: recentTxns, isLoading: txnsLoading } = useQuery<{
    data: TransactionRow[];
  }>({
    queryKey: ['admin', 'ai-credits', 'transactions', { page: 1, limit: 10 }],
    queryFn: async () => {
      const res = await fetch(
        '/api/v1/admin/ai-credits/transactions?page=1&limit=10'
      );
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  if (overviewLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const consumed = Number(overview?.total_credits_consumed ?? 0);
  const allocated = Number(overview?.total_credits_allocated ?? 0);
  const usagePct = allocated > 0 ? (consumed / allocated) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label={t('stat_workspaces')}
          value={String(overview?.total_workspaces_with_balance ?? 0)}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label={t('stat_users')}
          value={String(overview?.total_users_with_balance ?? 0)}
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label={t('stat_consumed')}
          value={formatCredits(consumed)}
          subtitle={`${usagePct.toFixed(1)}% ${t('of_allocated')}`}
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label={t('stat_allocated')}
          value={formatCredits(allocated)}
          subtitle={
            overview?.total_bonus_credits
              ? `+${formatCredits(Number(overview.total_bonus_credits))} ${t('bonus')}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('top_workspace_consumers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(overview?.top_workspace_consumers ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('no_data')}</p>
              ) : (
                (overview?.top_workspace_consumers ?? []).map((ws, i) => {
                  const total =
                    Number(ws.total_allocated) + Number(ws.bonus_credits);
                  const pct =
                    total > 0 ? (Number(ws.total_used) / total) * 100 : 0;
                  return (
                    <div
                      key={ws.ws_id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-5 text-muted-foreground text-xs">
                        {i + 1}.
                      </span>
                      <code className="min-w-0 flex-1 truncate text-xs">
                        {ws.ws_id.slice(0, 12)}...
                      </code>
                      <span className="font-medium">
                        {formatCredits(Number(ws.total_used))}
                      </span>
                      <Badge
                        variant={
                          pct >= 90
                            ? 'destructive'
                            : pct >= 70
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {pct.toFixed(0)}%
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('top_user_consumers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(overview?.top_user_consumers ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('no_data')}</p>
              ) : (
                (overview?.top_user_consumers ?? []).map((u, i) => {
                  const total =
                    Number(u.total_allocated) + Number(u.bonus_credits);
                  const pct =
                    total > 0 ? (Number(u.total_used) / total) * 100 : 0;
                  return (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-5 text-muted-foreground text-xs">
                        {i + 1}.
                      </span>
                      <code className="min-w-0 flex-1 truncate text-xs">
                        {u.user_id.slice(0, 12)}...
                      </code>
                      <span className="font-medium">
                        {formatCredits(Number(u.total_used))}
                      </span>
                      <Badge
                        variant={
                          pct >= 90
                            ? 'destructive'
                            : pct >= 70
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {pct.toFixed(0)}%
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('recent_transactions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {txnsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (recentTxns?.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('no_data')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">
                      {t('transaction_time')}
                    </th>
                    <th className="pb-2 text-left font-medium">
                      {t('entity')}
                    </th>
                    <th className="pb-2 text-left font-medium">{t('model')}</th>
                    <th className="pb-2 text-left font-medium">
                      {t('feature')}
                    </th>
                    <th className="pb-2 text-right font-medium">
                      {t('cost_usd')}
                    </th>
                    <th className="pb-2 text-right font-medium">
                      {t('credits_deducted')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(recentTxns?.data ?? []).map((tx) => (
                    <tr key={tx.id} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground text-xs">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 text-xs">
                        {tx.ws_name ?? tx.user_display_name ?? '-'}
                      </td>
                      <td className="py-2 font-mono text-xs">
                        {tx.model_id ?? '-'}
                      </td>
                      <td className="py-2 text-xs">{tx.feature ?? '-'}</td>
                      <td className="py-2 text-right font-mono text-xs">
                        ${Number(tx.cost_usd ?? 0).toFixed(6)}
                      </td>
                      <td className="py-2 text-right font-mono text-xs">
                        {formatCredits(Number(tx.amount ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <div className="mt-1 font-bold text-2xl">{value}</div>
        {subtitle && (
          <div className="mt-0.5 text-muted-foreground text-xs">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}
