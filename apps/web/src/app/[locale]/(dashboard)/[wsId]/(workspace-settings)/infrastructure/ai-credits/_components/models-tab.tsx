'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, LayoutList, Search } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ProviderLogo } from '../../../../(dashboard)/components/provider-logo';

interface GatewayModel {
  id: string;
  name: string;
  provider: string;
  type: string;
  description: string | null;
  context_window: number | null;
  max_tokens: number | null;
  tags: string[] | null;
  input_price_per_token: number;
  output_price_per_token: number;
  input_tiers: any | null;
  output_tiers: any | null;
  cache_read_price_per_token: number | null;
  cache_write_price_per_token: number | null;
  web_search_price: number | null;
  image_gen_price: number | null;
  released_at: string | null;
  is_enabled: boolean;
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
  const [typeFilter, setTypeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState('');
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
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'models'],
      });
      toast.success(t('model_updated'));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('update_failed')),
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

  const types = useMemo(() => {
    const set = new Set(allModels.map((m) => m.type));
    return Array.from(set).sort();
  }, [allModels]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const model of allModels) {
      for (const tag of model.tags ?? []) {
        set.add(tag);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allModels]);

  const filteredModels = useMemo(() => {
    return allModels.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase());
      const matchesProvider =
        providerFilter === 'all' || m.provider === providerFilter;
      const matchesType = typeFilter === 'all' || m.type === typeFilter;
      const matchesTag =
        tagFilter === 'all' || (m.tags ?? []).some((tag) => tag === tagFilter);

      return matchesSearch && matchesProvider && matchesType && matchesTag;
    });
  }, [allModels, search, providerFilter, typeFilter, tagFilter]);

  const itemsPerPage = 50;
  const totalPages = Math.ceil(filteredModels.length / itemsPerPage);
  const pagedModels = filteredModels.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-linear-to-br from-background to-muted/20 shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
                {t('models_eyebrow')}
              </p>
              <h3 className="mt-1 font-semibold text-xl tracking-tight">
                {t('models_headline')}
              </h3>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('models_subcopy')}
              </p>
            </div>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              variant="outline"
            >
              {syncMutation.isPending ? t('syncing') : t('sync_from_gateway')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('search_models')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-64 bg-background/80 pl-9"
              />
            </div>
            <Select
              value={providerFilter}
              onValueChange={(v) => {
                setProviderFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 bg-background/80">
                <SelectValue placeholder={t('filter_by_provider')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_providers')}</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 bg-background/80">
                <SelectValue placeholder={t('all_types')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_types')}</SelectItem>
                {types.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={tagFilter}
              onValueChange={(v) => {
                setTagFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 bg-background/80">
                <SelectValue placeholder={t('filter_by_tag')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_tags')}</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground text-sm">
            {filteredModels.length} {t('results')}
          </p>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === 'list' || value === 'grid') setViewMode(value);
            }}
            className="inline-flex gap-0.5 rounded-lg border bg-muted/40 p-0.5"
            aria-label={t('view_mode')}
          >
            <ToggleGroupItem
              value="list"
              aria-label={t('view_list')}
              className="h-8 rounded-md px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="grid"
              aria-label={t('view_grid')}
              className="h-8 rounded-md px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          {pagedModels.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">
                  {t('no_models')}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === 'list' ? (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-1">
                  {pagedModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex flex-col gap-2 rounded-lg px-3 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium font-mono text-sm">
                            {model.id}
                          </span>
                          {model.tags?.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
                          <span className="flex items-center gap-1.5 font-medium capitalize">
                            <ProviderLogo
                              provider={model.provider}
                              size={12}
                              className="opacity-70"
                            />
                            {model.provider}
                          </span>
                          <span>&middot;</span>
                          <span className="capitalize">{model.type}</span>
                          {model.context_window && (
                            <>
                              <span>&middot;</span>
                              <span>
                                {model.context_window >= 1000000
                                  ? `${(model.context_window / 1000000).toFixed(0)}M`
                                  : `${(model.context_window / 1000).toFixed(0)}K`}{' '}
                                ctx
                              </span>
                            </>
                          )}
                          {model.max_tokens && (
                            <>
                              <span>&middot;</span>
                              <span>
                                {model.max_tokens >= 1000000
                                  ? `${(model.max_tokens / 1000000).toFixed(0)}M`
                                  : `${(model.max_tokens / 1000).toFixed(0)}K`}{' '}
                                max
                              </span>
                            </>
                          )}
                        </div>
                        {model.description && (
                          <p className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                            {model.description}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-4 sm:mt-0 sm:shrink-0">
                        <div className="text-right text-xs">
                          {model.type === 'image' &&
                          model.image_gen_price !== null ? (
                            <div>
                              Image: ${Number(model.image_gen_price).toFixed(3)}
                              /img
                            </div>
                          ) : (
                            <>
                              <div className="group relative">
                                In: $
                                {(
                                  Number(model.input_price_per_token) *
                                  1_000_000
                                ).toFixed(3)}
                                /M
                              </div>
                              <div className="group relative">
                                Out: $
                                {(
                                  Number(model.output_price_per_token) *
                                  1_000_000
                                ).toFixed(3)}
                                /M
                              </div>
                            </>
                          )}
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
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pagedModels.map((model) => (
                <Card key={model.id} className="flex h-full flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <span className="truncate font-mono">{model.id}</span>
                        </CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                          <span className="flex items-center gap-1.5 font-medium capitalize">
                            <ProviderLogo
                              provider={model.provider}
                              size={12}
                              className="opacity-70"
                            />
                            {model.provider}
                          </span>
                          <span>&middot;</span>
                          <span className="capitalize">{model.type}</span>
                          {model.context_window && (
                            <>
                              <span>&middot;</span>
                              <span>
                                {model.context_window >= 1000000
                                  ? `${(model.context_window / 1000000).toFixed(0)}M`
                                  : `${(model.context_window / 1000).toFixed(0)}K`}{' '}
                                ctx
                              </span>
                            </>
                          )}
                          {model.max_tokens && (
                            <>
                              <span>&middot;</span>
                              <span>
                                {model.max_tokens >= 1000000
                                  ? `${(model.max_tokens / 1000000).toFixed(0)}M`
                                  : `${(model.max_tokens / 1000).toFixed(0)}K`}{' '}
                                max
                              </span>
                            </>
                          )}
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
                    {model.tags && model.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {model.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto space-y-2 pt-0 pb-4 text-xs">
                    {model.description && (
                      <p className="line-clamp-2 text-muted-foreground">
                        {model.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-4 text-muted-foreground">
                      {model.type === 'image' &&
                      model.image_gen_price !== null ? (
                        <span>
                          Image:{' '}
                          {`$${Number(model.image_gen_price).toFixed(3)}/img`}
                        </span>
                      ) : (
                        <>
                          <span>
                            In: $
                            {(
                              Number(model.input_price_per_token) * 1_000_000
                            ).toFixed(3)}
                            /M
                          </span>
                          <span>
                            Out: $
                            {(
                              Number(model.output_price_per_token) * 1_000_000
                            ).toFixed(3)}
                            /M
                          </span>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

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
