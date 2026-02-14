'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface EnrichedBalance {
  id: string;
  ws_id: string | null;
  user_id: string | null;
  period_start: string;
  period_end: string;
  total_allocated: number;
  total_used: number;
  bonus_credits: number;
  scope: 'user' | 'workspace';
  workspace: {
    id: string;
    name: string | null;
    member_count: number;
  } | null;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface BalancesResponse {
  data: EnrichedBalance[];
  pagination: { page: number; limit: number; total: number };
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

function usageBadgeVariant(pct: number) {
  if (pct >= 90) return 'destructive' as const;
  if (pct >= 70) return 'secondary' as const;
  return 'outline' as const;
}

type ScopeFilter = 'all' | 'user' | 'workspace';

export default function BalancesTab() {
  const t = useTranslations('ai-credits-admin');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [bonusBalanceId, setBonusBalanceId] = useState<string | null>(null);
  const [bonusAmount, setBonusAmount] = useState('');

  const { data, isLoading } = useQuery<BalancesResponse>({
    queryKey: [
      'admin',
      'ai-credits',
      'balances',
      { page, search, scope: scopeFilter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (scopeFilter !== 'all') params.set('scope', scopeFilter);
      const res = await fetch(
        `/api/v1/admin/ai-credits/balances?${params.toString()}`
      );
      if (!res.ok) throw new Error('Failed to fetch balances');
      return res.json();
    },
  });

  const bonusMutation = useMutation({
    mutationFn: async ({
      balance_id,
      amount,
    }: {
      balance_id: string;
      amount: number;
    }) => {
      const res = await fetch('/api/v1/admin/ai-credits/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance_id, amount }),
      });
      if (!res.ok) throw new Error('Failed to add bonus');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'balances'],
      });
      toast.success(t('bonus_added'));
      setBonusBalanceId(null);
      setBonusAmount('');
    },
    onError: () => toast.error(t('update_failed')),
  });

  const balances = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.limit)
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={String(t('search_by_id'))}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {(['all', 'user', 'workspace'] as const).map((scope) => (
            <Button
              key={scope}
              variant={scopeFilter === scope ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setScopeFilter(scope);
                setPage(1);
              }}
            >
              {t(`scope_${scope}`)}
            </Button>
          ))}
        </div>
        {pagination && (
          <Badge variant="outline" className="ml-auto">
            {pagination.total} {t('results')}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              {balances.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t('no_balances')}
                </p>
              ) : (
                <div className="space-y-2">
                  {balances.map((balance) => (
                    <BalanceRow
                      key={balance.id}
                      balance={balance}
                      isBonusActive={bonusBalanceId === balance.id}
                      bonusAmount={bonusAmount}
                      onBonusAmountChange={setBonusAmount}
                      onActivateBonus={() => setBonusBalanceId(balance.id)}
                      onCancelBonus={() => {
                        setBonusBalanceId(null);
                        setBonusAmount('');
                      }}
                      onSubmitBonus={() =>
                        bonusMutation.mutate({
                          balance_id: balance.id,
                          amount: Number(bonusAmount),
                        })
                      }
                      isPending={bonusMutation.isPending}
                      t={t}
                    />
                  ))}
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
    </div>
  );
}

function BalanceRow({
  balance,
  isBonusActive,
  bonusAmount,
  onBonusAmountChange,
  onActivateBonus,
  onCancelBonus,
  onSubmitBonus,
  isPending,
  t,
}: {
  balance: EnrichedBalance;
  isBonusActive: boolean;
  bonusAmount: string;
  onBonusAmountChange: (v: string) => void;
  onActivateBonus: () => void;
  onCancelBonus: () => void;
  onSubmitBonus: () => void;
  isPending: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const total = Number(balance.total_allocated) + Number(balance.bonus_credits);
  const used = Number(balance.total_used);
  const remaining = total - used;
  const pct = total > 0 ? (used / total) * 100 : 0;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={balance.scope === 'user' ? 'secondary' : 'default'}>
              {balance.scope === 'user'
                ? t('scope_user')
                : t('scope_workspace')}
            </Badge>

            {balance.workspace && (
              <span className="font-medium text-sm">
                {balance.workspace.name ?? balance.workspace.id.slice(0, 8)}
              </span>
            )}
            {balance.user && (
              <span className="font-medium text-sm">
                {balance.user.display_name ?? balance.user.id.slice(0, 8)}
              </span>
            )}

            {balance.workspace && balance.workspace.member_count > 0 && (
              <Badge variant="outline">
                {balance.workspace.member_count} {t('members')}
              </Badge>
            )}

            <Badge variant={usageBadgeVariant(pct)}>{pct.toFixed(0)}%</Badge>
          </div>

          <div className="mt-1 text-muted-foreground text-xs">
            <code>{balance.ws_id ?? balance.user_id}</code>
          </div>

          <div className="mt-2 flex items-center gap-3 text-sm">
            <span>
              {formatCredits(used)} / {formatCredits(total)}
            </span>
            <div className="h-1.5 max-w-32 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-dynamic-purple transition-all"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-muted-foreground text-xs">
              {formatCredits(remaining)} {t('remaining')}
            </span>
            {Number(balance.bonus_credits) > 0 && (
              <Badge variant="outline" className="text-xs">
                +{formatCredits(Number(balance.bonus_credits))} {t('bonus')}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          {isBonusActive ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={bonusAmount}
                onChange={(e) => onBonusAmountChange(e.target.value)}
                placeholder="Amount"
                className="h-8 w-24"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!bonusAmount || Number(bonusAmount) <= 0 || isPending}
                onClick={onSubmitBonus}
              >
                {t('add')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelBonus}>
                {t('cancel')}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={onActivateBonus}>
              {t('add_bonus')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
