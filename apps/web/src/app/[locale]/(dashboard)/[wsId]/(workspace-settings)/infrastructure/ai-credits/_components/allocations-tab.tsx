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
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Allocation {
  id: string;
  tier: string;
  monthly_credits: number;
  credits_per_seat: number | null;
  daily_limit: number | null;
  default_image_model?: string | null;
  default_language_model?: string | null;
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
  type: string;
  is_enabled: boolean;
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

function formatModelLabel(modelId?: string | null) {
  if (!modelId) return '-';

  return modelId.includes('/')
    ? modelId.split('/').slice(1).join('/')
    : modelId;
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
      <div className="grid gap-4 xl:grid-cols-2">
        {(allocations ?? []).map((alloc) => (
          <Card
            key={alloc.id}
            className="overflow-hidden border-border/70 bg-linear-to-br from-background via-background to-muted/20 shadow-sm"
          >
            <CardHeader className="border-border/60 border-b bg-muted/20 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl tracking-tight">
                    {alloc.tier}
                  </CardTitle>
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
            <CardContent className="space-y-5 pt-5">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('default_language_model')}
                  </dt>
                  <dd className="mt-1 truncate font-medium font-mono text-xs">
                    {formatModelLabel(alloc.default_language_model)}
                  </dd>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('default_image_model')}
                  </dt>
                  <dd className="mt-1 truncate font-medium font-mono text-xs">
                    {formatModelLabel(alloc.default_image_model)}
                  </dd>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('monthly_credits')}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatCredits(alloc.monthly_credits)}
                  </dd>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('credits_per_seat')}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {alloc.credits_per_seat != null
                      ? formatCredits(alloc.credits_per_seat)
                      : '-'}
                  </dd>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('daily_limit')}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {alloc.daily_limit != null
                      ? formatCredits(alloc.daily_limit)
                      : t('unlimited')}
                  </dd>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('max_output_tokens')}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {alloc.max_output_tokens_per_request?.toLocaleString() ??
                      t('unlimited')}
                  </dd>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {t('markup')}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {alloc.markup_multiplier}x
                  </dd>
                </div>
              </dl>

              <div className="rounded-xl border border-border/70 border-dashed bg-muted/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{t('allowed_models')}</p>
                    <p className="text-muted-foreground text-xs">
                      {alloc.allowed_models.length === 0
                        ? t('alloc_allowlist_all_description')
                        : t('alloc_allowlist_limited_description', {
                            count: alloc.allowed_models.length,
                          })}
                    </p>
                  </div>
                  <Badge
                    variant={
                      alloc.allowed_models.length === 0
                        ? 'outline'
                        : 'secondary'
                    }
                  >
                    {alloc.allowed_models.length === 0
                      ? t('all_models')
                      : alloc.allowed_models.length}
                  </Badge>
                </div>
              </div>
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
  const [defaultImageModel, setDefaultImageModel] = useState(
    allocation.default_image_model ?? ''
  );
  const [defaultLanguageModel, setDefaultLanguageModel] = useState(
    allocation.default_language_model ?? ''
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
    setDefaultImageModel(allocation.default_image_model ?? '');
    setDefaultLanguageModel(allocation.default_language_model ?? '');
    setMaxOutputTokens(allocation.max_output_tokens_per_request);
    setMarkupMultiplier(allocation.markup_multiplier);
    setSelectedModels(allocation.allowed_models);
  }, [allocation]);

  const languageModels = availableModels.filter(
    (model) => model.type === 'language'
  );
  const imageModels = availableModels.filter((model) => model.type === 'image');

  const filteredModels = availableModels.filter(
    (m) =>
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.provider.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleSave = () => {
    const nextAllowedModels =
      selectedModels.length === 0
        ? selectedModels
        : Array.from(
            new Set([
              ...selectedModels,
              defaultLanguageModel,
              defaultImageModel,
            ])
          );

    onSave({
      monthly_credits: monthlyCredits,
      credits_per_seat: creditsPerSeat,
      daily_limit: dailyLimit,
      default_image_model: defaultImageModel,
      default_language_model: defaultLanguageModel,
      max_output_tokens_per_request: maxOutputTokens,
      markup_multiplier: markupMultiplier,
      allowed_models: nextAllowedModels,
    });
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((m) => m !== modelId)
        : [...prev, modelId]
    );
  };

  const canSave = Boolean(defaultLanguageModel && defaultImageModel);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('default_language_model')}</Label>
              <Select
                value={defaultLanguageModel}
                onValueChange={(value) => {
                  setDefaultLanguageModel(value);
                  if (
                    selectedModels.length > 0 &&
                    !selectedModels.includes(value)
                  ) {
                    setSelectedModels((prev) => [...prev, value]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('select_default_language_model')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {languageModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {formatModelLabel(model.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('default_image_model')}</Label>
              <Select
                value={defaultImageModel}
                onValueChange={(value) => {
                  setDefaultImageModel(value);
                  if (
                    selectedModels.length > 0 &&
                    !selectedModels.includes(value)
                  ) {
                    setSelectedModels((prev) => [...prev, value]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('select_default_image_model')} />
                </SelectTrigger>
                <SelectContent>
                  {imageModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {formatModelLabel(model.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <p className="text-muted-foreground text-xs">
              {t('alloc_defaults_pinned_description')}
            </p>
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
                    {(model.id === defaultLanguageModel ||
                      model.id === defaultImageModel) && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {model.id === defaultLanguageModel &&
                        model.id === defaultImageModel
                          ? t('default_model')
                          : model.id === defaultLanguageModel
                            ? t('default_language_short')
                            : t('default_image_short')}
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isPending || !canSave}>
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
