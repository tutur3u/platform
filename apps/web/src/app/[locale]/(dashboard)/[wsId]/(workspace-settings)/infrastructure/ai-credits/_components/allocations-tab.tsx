'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Allocation {
  id: string;
  tier: string;
  monthly_credits: number;
  credits_per_seat: number | null;
  daily_limit: number | null;
  max_output_tokens_per_request: number | null;
  markup_multiplier: number;
  allowed_models: string[];
  allowed_features: string[];
  max_requests_per_day: number | null;
  is_active: boolean;
}

interface GatewayModel {
  id: string;
  name: string;
  provider: string;
  is_enabled: boolean;
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

function tierBadgeVariant(tier: string) {
  switch (tier) {
    case 'FREE':
      return 'secondary' as const;
    case 'PLUS':
    case 'PRO':
      return 'default' as const;
    case 'ENTERPRISE':
      return 'destructive' as const;
    default:
      return 'outline' as const;
  }
}

export default function AllocationsTab() {
  const t = useTranslations('ai-credits-admin');
  const queryClient = useQueryClient();
  const [editingAlloc, setEditingAlloc] = useState<Allocation | null>(null);

  const { data: allocations, isLoading } = useQuery<Allocation[]>({
    queryKey: ['admin', 'ai-credits', 'allocations'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ai-credits/allocations');
      if (!res.ok) throw new Error('Failed to fetch allocations');
      return res.json();
    },
  });

  const { data: modelsResponse } = useQuery<{
    data: GatewayModel[];
    pagination: { total: number };
  }>({
    queryKey: ['admin', 'ai-credits', 'models', { page: 1, limit: 500 }],
    queryFn: async () => {
      const res = await fetch(
        '/api/v1/admin/ai-credits/models?page=1&limit=500'
      );
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    },
  });

  const availableModels = modelsResponse?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Allocation> & { id: string }) => {
      const res = await fetch('/api/v1/admin/ai-credits/allocations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'allocations'],
      });
      if (data?.balances_updated != null && data.balances_updated > 0) {
        toast.success(
          t('allocation_updated_with_balances', {
            count: data.balances_updated,
          })
        );
      } else {
        toast.success(t('allocation_updated'));
      }
      setEditingAlloc(null);
    },
    onError: () => toast.error(t('update_failed')),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {(allocations ?? []).map((alloc) => (
          <Card key={alloc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>{alloc.tier}</CardTitle>
                  <Badge variant={tierBadgeVariant(alloc.tier)}>
                    {alloc.is_active ? t('active') : t('inactive')}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingAlloc(alloc)}
                  >
                    {t('edit')}
                  </Button>
                  <Switch
                    checked={alloc.is_active}
                    onCheckedChange={(checked) =>
                      updateMutation.mutate({
                        id: alloc.id,
                        is_active: checked,
                      })
                    }
                  />
                </div>
              </div>
              <CardDescription>
                {alloc.credits_per_seat != null
                  ? `${formatCredits(alloc.credits_per_seat)} ${t('credits_per_seat')}`
                  : `${formatCredits(alloc.monthly_credits)} ${t('monthly_credits')}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">
                  {t('monthly_credits')}
                </dt>
                <dd className="font-medium">
                  {formatCredits(alloc.monthly_credits)}
                </dd>

                <dt className="text-muted-foreground">
                  {t('credits_per_seat')}
                </dt>
                <dd className="font-medium">
                  {alloc.credits_per_seat != null
                    ? formatCredits(alloc.credits_per_seat)
                    : '-'}
                </dd>

                <dt className="text-muted-foreground">{t('daily_limit')}</dt>
                <dd className="font-medium">
                  {alloc.daily_limit != null
                    ? formatCredits(alloc.daily_limit)
                    : t('unlimited')}
                </dd>

                <dt className="text-muted-foreground">
                  {t('max_output_tokens')}
                </dt>
                <dd className="font-medium">
                  {alloc.max_output_tokens_per_request?.toLocaleString() ??
                    t('unlimited')}
                </dd>

                <dt className="text-muted-foreground">{t('markup')}</dt>
                <dd className="font-medium">{alloc.markup_multiplier}x</dd>

                <dt className="text-muted-foreground">{t('allowed_models')}</dt>
                <dd className="font-medium">
                  {alloc.allowed_models.length === 0 ? (
                    <Badge variant="outline">{t('all_models')}</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {alloc.allowed_models.length}
                    </Badge>
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingAlloc && (
        <EditAllocationDialog
          allocation={editingAlloc}
          availableModels={availableModels}
          onSave={(updates) =>
            updateMutation.mutate({ id: editingAlloc.id, ...updates })
          }
          onClose={() => setEditingAlloc(null)}
          isPending={updateMutation.isPending}
          t={t}
        />
      )}
    </>
  );
}

function EditAllocationDialog({
  allocation,
  availableModels,
  onSave,
  onClose,
  isPending,
  t,
}: {
  allocation: Allocation;
  availableModels: GatewayModel[];
  onSave: (updates: Partial<Allocation>) => void;
  onClose: () => void;
  isPending: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [monthlyCredits, setMonthlyCredits] = useState(
    allocation.monthly_credits
  );
  const [creditsPerSeat, setCreditsPerSeat] = useState<number | null>(
    allocation.credits_per_seat
  );
  const [dailyLimit, setDailyLimit] = useState<number | null>(
    allocation.daily_limit
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | null>(
    allocation.max_output_tokens_per_request
  );
  const [markupMultiplier, setMarkupMultiplier] = useState(
    allocation.markup_multiplier
  );
  const [selectedModels, setSelectedModels] = useState<string[]>(
    allocation.allowed_models
  );
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    setMonthlyCredits(allocation.monthly_credits);
    setCreditsPerSeat(allocation.credits_per_seat);
    setDailyLimit(allocation.daily_limit);
    setMaxOutputTokens(allocation.max_output_tokens_per_request);
    setMarkupMultiplier(allocation.markup_multiplier);
    setSelectedModels(allocation.allowed_models);
  }, [allocation]);

  const filteredModels = availableModels.filter(
    (m) =>
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.provider.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleSave = () => {
    onSave({
      monthly_credits: monthlyCredits,
      credits_per_seat: creditsPerSeat,
      daily_limit: dailyLimit,
      max_output_tokens_per_request: maxOutputTokens,
      markup_multiplier: markupMultiplier,
      allowed_models: selectedModels,
    });
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((m) => m !== modelId)
        : [...prev, modelId]
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('edit')} {allocation.tier}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('monthly_credits')}</Label>
              <Input
                type="number"
                value={monthlyCredits}
                onChange={(e) => setMonthlyCredits(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('credits_per_seat')}</Label>
              <Input
                type="number"
                value={creditsPerSeat ?? ''}
                placeholder="-"
                onChange={(e) =>
                  setCreditsPerSeat(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('daily_limit')}</Label>
              <Input
                type="number"
                value={dailyLimit ?? ''}
                placeholder={String(t('unlimited'))}
                onChange={(e) =>
                  setDailyLimit(e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t('max_output_tokens')}</Label>
              <Input
                type="number"
                value={maxOutputTokens ?? ''}
                placeholder={String(t('unlimited'))}
                onChange={(e) =>
                  setMaxOutputTokens(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('markup')}</Label>
            <Input
              type="number"
              step="0.1"
              value={markupMultiplier}
              onChange={(e) => setMarkupMultiplier(Number(e.target.value))}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('allowed_models')}</Label>
              <div className="flex gap-2">
                {selectedModels.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedModels([])}
                  >
                    {t('clear_all')}
                  </Button>
                )}
                <Badge variant="outline">
                  {selectedModels.length === 0
                    ? t('all_models')
                    : `${selectedModels.length} ${t('selected')}`}
                </Badge>
              </div>
            </div>
            <Input
              placeholder={String(t('search_models'))}
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {filteredModels.length === 0 ? (
                <p className="py-2 text-center text-muted-foreground text-sm">
                  {t('no_models')}
                </p>
              ) : (
                filteredModels.map((model) => (
                  <label
                    key={model.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.id)}
                      onChange={() => toggleModel(model.id)}
                      className="rounded"
                    />
                    <span className="min-w-0 truncate font-mono text-xs">
                      {model.id}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
