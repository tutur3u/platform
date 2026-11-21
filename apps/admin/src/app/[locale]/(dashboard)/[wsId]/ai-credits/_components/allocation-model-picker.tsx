'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import type { GatewayModel } from './allocation-types';

const MODEL_PAGE_LIMIT = 40;

interface ModelsPage {
  data: GatewayModel[];
  pagination: {
    limit: number;
    page: number;
    total: number;
  };
}

function formatModelLabel(modelId?: string | null) {
  if (!modelId) return '-';

  return modelId.includes('/')
    ? modelId.split('/').slice(1).join('/')
    : modelId;
}

function mergeModels(...groups: GatewayModel[][]) {
  const seen = new Set<string>();
  const models: GatewayModel[] = [];

  for (const group of groups) {
    for (const model of group) {
      if (seen.has(model.id)) continue;
      seen.add(model.id);
      models.push(model);
    }
  }

  return models;
}

async function fetchAdminModelsPage({
  ids,
  page,
  query,
  type,
}: {
  ids?: string[];
  page: number;
  query?: string;
  type?: string;
}) {
  const params = new URLSearchParams({
    enabled: 'true',
    limit: String(MODEL_PAGE_LIMIT),
    page: String(page),
  });

  if (type) params.set('type', type);
  if (query) params.set('q', query);
  if (ids?.length) params.set('ids', ids.join(','));

  const res = await fetch(`/api/v1/admin/ai-credits/models?${params}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch models');

  return (await res.json()) as ModelsPage;
}

function useAdminModelPages(type: string, query: string) {
  return useInfiniteQuery<
    ModelsPage,
    Error,
    InfiniteData<ModelsPage, number>,
    readonly ['admin', 'ai-credits', 'models', string, string],
    number
  >({
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.pagination.page * lastPage.pagination.limit;
      return loaded < lastPage.pagination.total
        ? lastPage.pagination.page + 1
        : undefined;
    },
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchAdminModelsPage({ page: pageParam, query, type }),
    queryKey: ['admin', 'ai-credits', 'models', type, query],
  });
}

function usePinnedModels(ids: string[]) {
  const uniqueIds = useMemo(
    () => [...new Set(ids.filter(Boolean))].sort(),
    [ids]
  );

  return useQuery({
    enabled: uniqueIds.length > 0,
    queryFn: () => fetchAdminModelsPage({ ids: uniqueIds, page: 1 }),
    queryKey: ['admin', 'ai-credits', 'models', 'pinned', uniqueIds],
  });
}

function ModelRow({
  badge,
  checked,
  model,
  onSelect,
}: {
  badge?: string;
  checked?: boolean;
  model: GatewayModel;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60"
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {model.name || formatModelLabel(model.id)}
        </span>
        <span className="block truncate font-mono text-muted-foreground text-xs">
          {model.id}
        </span>
      </span>
      {badge && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {badge}
        </Badge>
      )}
      {checked && <Check className="size-4 shrink-0 text-primary" />}
    </button>
  );
}

export function AdminDefaultModelPicker({
  onChange,
  selectedModels,
  setSelectedModels,
  t,
  type,
  value,
}: {
  onChange: (value: string) => void;
  selectedModels: string[];
  setSelectedModels: Dispatch<SetStateAction<string[]>>;
  t: ReturnType<typeof useTranslations>;
  type: 'image' | 'language';
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const modelPages = useAdminModelPages(type, query);
  const pinnedModels = usePinnedModels(value ? [value] : []);
  const models = mergeModels(
    pinnedModels.data?.data ?? [],
    modelPages.data?.pages.flatMap((page) => page.data) ?? []
  );
  const selectedModel = models.find((model) => model.id === value);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    if (selectedModels.length > 0 && !selectedModels.includes(modelId)) {
      setSelectedModels((prev) => [...prev, modelId]);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-10 w-full justify-between gap-3 px-3 py-2"
        >
          <span className="min-w-0 text-left">
            <span className="block truncate">
              {selectedModel?.name || formatModelLabel(value)}
            </span>
            {value && (
              <span className="block truncate font-mono text-muted-foreground text-xs">
                {value}
              </span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,28rem)] p-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={String(t('search_models'))}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border">
          {modelPages.isLoading ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">
              {t('loading_models')}
            </p>
          ) : models.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">
              {t('no_models')}
            </p>
          ) : (
            models.map((model) => (
              <ModelRow
                key={model.id}
                badge={model.id === value ? t('selected') : undefined}
                checked={model.id === value}
                model={model}
                onSelect={() => handleSelect(model.id)}
              />
            ))
          )}
        </div>
        {modelPages.hasNextPage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            disabled={modelPages.isFetchingNextPage}
            onClick={() => modelPages.fetchNextPage()}
          >
            {modelPages.isFetchingNextPage
              ? t('loading_more_models')
              : t('load_more_models')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AdminModelAllowlistPicker({
  defaultImageModel,
  defaultLanguageModel,
  selectedModels,
  setSelectedModels,
  t,
}: {
  defaultImageModel: string;
  defaultLanguageModel: string;
  selectedModels: string[];
  setSelectedModels: Dispatch<SetStateAction<string[]>>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [query, setQuery] = useState('');
  const modelPages = useAdminModelPages('all', query);
  const pinnedIds = [
    ...selectedModels,
    defaultLanguageModel,
    defaultImageModel,
  ].filter(Boolean);
  const pinnedModels = usePinnedModels(pinnedIds);
  const models = mergeModels(
    pinnedModels.data?.data ?? [],
    modelPages.data?.pages.flatMap((page) => page.data) ?? []
  );

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={String(t('search_models'))}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t('alloc_defaults_pinned_description')}
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
        {modelPages.isLoading ? (
          <p className="py-3 text-center text-muted-foreground text-sm">
            {t('loading_models')}
          </p>
        ) : models.length === 0 ? (
          <p className="py-3 text-center text-muted-foreground text-sm">
            {t('no_models')}
          </p>
        ) : (
          models.map((model) => {
            const isDefaultLanguage = model.id === defaultLanguageModel;
            const isDefaultImage = model.id === defaultImageModel;

            return (
              <label
                key={model.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60',
                  selectedModels.includes(model.id) && 'bg-muted/40'
                )}
              >
                <Checkbox
                  checked={selectedModels.includes(model.id)}
                  onCheckedChange={() => toggleModel(model.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {model.name || formatModelLabel(model.id)}
                  </span>
                  <span className="block truncate font-mono text-muted-foreground text-xs">
                    {model.id}
                  </span>
                </span>
                {(isDefaultLanguage || isDefaultImage) && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {isDefaultLanguage && isDefaultImage
                      ? t('default_model')
                      : isDefaultLanguage
                        ? t('default_language_short')
                        : t('default_image_short')}
                  </Badge>
                )}
              </label>
            );
          })
        )}
      </div>
      {modelPages.hasNextPage && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={modelPages.isFetchingNextPage}
          onClick={() => modelPages.fetchNextPage()}
        >
          {modelPages.isFetchingNextPage
            ? t('loading_more_models')
            : t('load_more_models')}
        </Button>
      )}
    </div>
  );
}
