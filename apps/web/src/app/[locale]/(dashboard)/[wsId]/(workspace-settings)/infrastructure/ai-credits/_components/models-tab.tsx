'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface GatewayModel {
  id: string;
  name: string;
  provider: string;
  type: string;
  is_enabled: boolean;
  input_price_per_token: number;
  output_price_per_token: number;
  synced_at: string;
}

interface ModelsResponse {
  data: GatewayModel[];
  pagination: { page: number; limit: number; total: number };
}

export default function ModelsTab() {
  const t = useTranslations('ai-credits-admin');
  const queryClient = useQueryClient();
  const [providerFilter, setProviderFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<ModelsResponse>({
    queryKey: ['admin', 'ai-credits', 'models', { page, limit: 500 }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '500' });
      const res = await fetch(
        `/api/v1/admin/ai-credits/models?${params.toString()}`
      );
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      id,
      is_enabled,
    }: {
      id: string;
      is_enabled: boolean;
    }) => {
      const res = await fetch('/api/v1/admin/ai-credits/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'models'],
      });
      toast.success(t('model_updated'));
    },
    onError: () => toast.error(t('update_failed')),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/admin/ai-credits/sync-models', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'models'],
      });
      toast.success(
        t('sync_complete', {
          synced: data.synced ?? 0,
          new: data.new ?? 0,
          updated: data.updated ?? 0,
        })
      );
    },
    onError: () => toast.error(t('sync_failed')),
  });

  const allModels = data?.data ?? [];

  const providers = useMemo(() => {
    const set = new Set(allModels.map((m) => m.provider));
    return Array.from(set).sort();
  }, [allModels]);

  const filteredModels =
    providerFilter === 'all'
      ? allModels
      : allModels.filter((m) => m.provider === providerFilter);

  const itemsPerPage = 50;
  const totalPages = Math.ceil(filteredModels.length / itemsPerPage);
  const pagedModels = filteredModels.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={providerFilter}
            onValueChange={(v) => {
              setProviderFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('filter_by_provider')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all_providers')}</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline">
            {filteredModels.length} {t('results')}
          </Badge>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          variant="outline"
        >
          {syncMutation.isPending ? t('syncing') : t('sync_from_gateway')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-1">
                {pagedModels.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    {t('no_models')}
                  </p>
                ) : (
                  pagedModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm">{model.id}</div>
                        <div className="text-muted-foreground text-xs">
                          {model.provider} &middot; {model.type}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right text-xs">
                          <div>
                            In: $
                            {(
                              Number(model.input_price_per_token) * 1_000_000
                            ).toFixed(3)}
                            /M
                          </div>
                          <div>
                            Out: $
                            {(
                              Number(model.output_price_per_token) * 1_000_000
                            ).toFixed(3)}
                            /M
                          </div>
                        </div>
                        <Switch
                          checked={model.is_enabled}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({
                              id: model.id,
                              is_enabled: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
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
