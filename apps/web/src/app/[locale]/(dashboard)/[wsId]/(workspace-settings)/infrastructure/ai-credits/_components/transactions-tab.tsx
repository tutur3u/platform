'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TransactionRow {
  id: string;
  created_at: string;
  ws_id: string | null;
  user_id: string | null;
  transaction_type: string;
  amount: number | null;
  cost_usd: number | null;
  model_id: string | null;
  feature: string | null;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  ws_name: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  workspace_tier: string | null;
  ws_member_count: number | null;
}

interface TransactionsResponse {
  data: TransactionRow[];
  pagination: { page: number; limit: number; total: number };
}

interface EntityDetail {
  entity: {
    type: string;
    id: string;
    name: string | null;
    avatar_url: string | null;
    member_count: number | null;
  };
  tier: string | null;
  balance: {
    total_allocated: number;
    total_used: number;
    bonus_credits: number;
    period_start: string;
    period_end: string;
  } | null;
  usage_by_feature: { feature: string; credits: number; count: number }[];
  usage_by_model: { model_id: string; credits: number; count: number }[];
  daily_trend: { day: string; credits: number; count: number }[];
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

function typeBadgeVariant(type: string) {
  switch (type) {
    case 'deduction':
      return 'destructive' as const;
    case 'allocation':
    case 'bonus':
      return 'default' as const;
    case 'refund':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

export default function TransactionsTab() {
  const t = useTranslations('ai-credits-admin');
  const [page, setPage] = useState(1);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [featureFilter, setFeatureFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<{
    wsId?: string;
    userId?: string;
  } | null>(null);

  const { data, isLoading } = useQuery<TransactionsResponse>({
    queryKey: [
      'admin',
      'ai-credits',
      'transactions',
      {
        page,
        scope: scopeFilter,
        type: typeFilter,
        featureFilter,
        modelFilter,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      });
      if (scopeFilter !== 'all') params.set('scope', scopeFilter);
      if (typeFilter !== 'all') params.set('transaction_type', typeFilter);
      if (featureFilter) params.set('feature', featureFilter);
      if (modelFilter) params.set('model_id', modelFilter);
      const res = await fetch(
        `/api/v1/admin/ai-credits/transactions?${params.toString()}`
      );
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const { data: entityDetail, isLoading: entityLoading } =
    useQuery<EntityDetail>({
      queryKey: ['admin', 'ai-credits', 'entity-detail', selectedEntity],
      queryFn: async () => {
        const params = new URLSearchParams();
        if (selectedEntity?.wsId) params.set('ws_id', selectedEntity.wsId);
        if (selectedEntity?.userId)
          params.set('user_id', selectedEntity.userId);
        const res = await fetch(
          `/api/v1/admin/ai-credits/entity-detail?${params.toString()}`
        );
        if (!res.ok) throw new Error('Failed to fetch entity detail');
        return res.json();
      },
      enabled: !!selectedEntity,
    });

  const transactions = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.limit)
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={scopeFilter}
          onValueChange={(v) => {
            setScopeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('scope_all')}</SelectItem>
            <SelectItem value="user">{t('scope_user')}</SelectItem>
            <SelectItem value="workspace">{t('scope_workspace')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all_types')}</SelectItem>
            <SelectItem value="deduction">{t('type_deduction')}</SelectItem>
            <SelectItem value="allocation">{t('type_allocation')}</SelectItem>
            <SelectItem value="bonus">{t('type_bonus')}</SelectItem>
            <SelectItem value="refund">{t('type_refund')}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder={String(t('filter_feature'))}
          value={featureFilter}
          onChange={(e) => {
            setFeatureFilter(e.target.value);
            setPage(1);
          }}
          className="w-36"
        />

        <Input
          placeholder={String(t('filter_model'))}
          value={modelFilter}
          onChange={(e) => {
            setModelFilter(e.target.value);
            setPage(1);
          }}
          className="w-48"
        />

        {pagination && (
          <Badge variant="outline" className="ml-auto">
            {pagination.total} {t('results')}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              {transactions.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t('no_transactions')}
                </p>
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
                        <th className="pb-2 text-left font-medium">
                          {t('type')}
                        </th>
                        <th className="pb-2 text-left font-medium">
                          {t('model')}
                        </th>
                        <th className="pb-2 text-left font-medium">
                          {t('feature')}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t('tokens')}
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
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b last:border-0">
                          <td className="py-2 text-muted-foreground text-xs">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="text-left text-xs hover:underline"
                              onClick={() =>
                                setSelectedEntity(
                                  tx.ws_id
                                    ? { wsId: tx.ws_id }
                                    : tx.user_id
                                      ? { userId: tx.user_id }
                                      : null
                                )
                              }
                            >
                              <div>
                                {tx.ws_name ?? tx.user_display_name ?? '-'}
                              </div>
                              {tx.workspace_tier && (
                                <Badge
                                  variant="outline"
                                  className="mt-0.5 text-[10px]"
                                >
                                  {tx.workspace_tier}
                                </Badge>
                              )}
                            </button>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={typeBadgeVariant(tx.transaction_type)}
                            >
                              {tx.transaction_type}
                            </Badge>
                          </td>
                          <td className="py-2 font-mono text-xs">
                            {tx.model_id ?? '-'}
                          </td>
                          <td className="py-2 text-xs">{tx.feature ?? '-'}</td>
                          <td className="py-2 text-right text-xs">
                            {tx.transaction_type === 'deduction' ? (
                              <div className="space-y-0.5">
                                <div>
                                  {t('tokens_in')}:{' '}
                                  {Number(tx.input_tokens).toLocaleString()}
                                </div>
                                <div>
                                  {t('tokens_out')}:{' '}
                                  {Number(tx.output_tokens).toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('previous')}
              </Button>
              <span className="text-sm">
                {t('page_of', { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}

      <Sheet
        open={!!selectedEntity}
        onOpenChange={(open) => !open && setSelectedEntity(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('entity_detail')}</SheetTitle>
          </SheetHeader>
          {entityLoading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : entityDetail ? (
            <EntityDetailPanel detail={entityDetail} t={t} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EntityDetailPanel({
  detail,
  t,
}: {
  detail: EntityDetail;
  t: ReturnType<typeof useTranslations>;
}) {
  const balance = detail.balance;
  const total = balance
    ? Number(balance.total_allocated) + Number(balance.bonus_credits)
    : 0;
  const used = balance ? Number(balance.total_used) : 0;
  const pct = total > 0 ? (used / total) * 100 : 0;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {detail.entity.name ?? detail.entity.id.slice(0, 12)}
          </span>
          <Badge variant="outline">{detail.entity.type}</Badge>
          {detail.tier && <Badge>{detail.tier}</Badge>}
        </div>
        {detail.entity.member_count != null && (
          <div className="mt-1 text-muted-foreground text-xs">
            {detail.entity.member_count} {t('members')}
          </div>
        )}
      </div>

      {balance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('current_balance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('stat_consumed')}
                </span>
                <span className="font-medium">{formatCredits(used)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('stat_allocated')}
                </span>
                <span className="font-medium">{formatCredits(total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-dynamic-purple transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="text-muted-foreground text-xs">
                {balance.period_start} — {balance.period_end}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {detail.usage_by_feature.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('usage_by_feature')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {detail.usage_by_feature.map((f) => (
                <div
                  key={f.feature}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono text-xs">{f.feature}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {f.count}x
                    </span>
                    <span className="font-medium">
                      {formatCredits(Number(f.credits))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {detail.usage_by_model.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('usage_by_model')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {detail.usage_by_model.map((m) => (
                <div
                  key={m.model_id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="min-w-0 truncate font-mono text-xs">
                    {m.model_id}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {m.count}x
                    </span>
                    <span className="font-medium">
                      {formatCredits(Number(m.credits))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
