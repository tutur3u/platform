'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useDeferredValue, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

const PAGE_SIZE = 40;

interface ModelOption {
  id: string;
  name: string | null;
  provider: string | null;
}

interface ModelsPage {
  data: ModelOption[];
  pagination: {
    limit: number;
    page: number;
    total: number;
  };
}

interface ModelMultiSelectProps {
  emptyLabel: string;
  loadMoreLabel: string;
  loadingLabel: string;
  onChange: (value: string[]) => void;
  placeholder: string;
  removeLabel: (modelId: string) => string;
  searchPlaceholder: string;
  selectedCountLabel: (count: number) => string;
  value: string[];
}

async function fetchModels({
  ids,
  page,
  query,
}: {
  ids?: string[];
  page: number;
  query?: string;
}) {
  const params = new URLSearchParams({
    enabled: 'true',
    limit: String(PAGE_SIZE),
    page: String(page),
    type: 'all',
  });
  if (ids?.length) params.set('ids', ids.join(','));
  if (query) params.set('q', query);

  return apiFetch<ModelsPage>(
    `/api/v1/admin/ai-credits/models?${params.toString()}`
  );
}

function mergeModels(...groups: ModelOption[][]) {
  const models = new Map<string, ModelOption>();
  for (const group of groups) {
    for (const model of group) models.set(model.id, model);
  }
  return [...models.values()];
}

export function ModelMultiSelect({
  emptyLabel,
  loadMoreLabel,
  loadingLabel,
  onChange,
  placeholder,
  removeLabel,
  searchPlaceholder,
  selectedCountLabel,
  value,
}: ModelMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const selectedIds = useMemo(
    () => [...new Set(value.filter(Boolean))],
    [value]
  );
  const modelPages = useInfiniteQuery<
    ModelsPage,
    Error,
    InfiniteData<ModelsPage, number>,
    readonly ['ai-studio-policy-models', string],
    number
  >({
    enabled: open,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.pagination.page * lastPage.pagination.limit;
      return loaded < lastPage.pagination.total
        ? lastPage.pagination.page + 1
        : undefined;
    },
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchModels({ page: pageParam, query: deferredQuery }),
    queryKey: ['ai-studio-policy-models', deferredQuery],
  });
  const pinnedModels = useQuery({
    enabled: selectedIds.length > 0,
    queryFn: () => fetchModels({ ids: selectedIds, page: 1 }),
    queryKey: ['ai-studio-policy-models', 'selected', selectedIds],
  });
  const models = mergeModels(
    pinnedModels.data?.data ?? [],
    modelPages.data?.pages.flatMap((page) => page.data) ?? []
  );

  function toggleModel(modelId: string) {
    onChange(
      selectedIds.includes(modelId)
        ? selectedIds.filter((id) => id !== modelId)
        : [...selectedIds, modelId]
    );
  }

  return (
    <div className="space-y-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="h-auto min-h-10 w-full justify-between gap-3 px-3 py-2"
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="truncate text-left">
              {selectedIds.length
                ? selectedCountLabel(selectedIds.length)
                : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,32rem)] p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              value={query}
            />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border p-1">
            {modelPages.isLoading ? (
              <p className="px-3 py-8 text-center text-muted-foreground text-sm">
                {loadingLabel}
              </p>
            ) : models.length === 0 ? (
              <p className="px-3 py-8 text-center text-muted-foreground text-sm">
                {emptyLabel}
              </p>
            ) : (
              models.map((model) => {
                const selected = selectedIds.includes(model.id);
                return (
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60"
                    key={model.id}
                    onClick={() => toggleModel(model.id)}
                    type="button"
                  >
                    <Checkbox checked={selected} tabIndex={-1} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">
                        {model.name || model.id}
                      </span>
                      <span className="block truncate font-mono text-muted-foreground text-xs">
                        {model.id}
                      </span>
                    </span>
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          {modelPages.hasNextPage ? (
            <Button
              className="mt-2 w-full"
              disabled={modelPages.isFetchingNextPage}
              onClick={() => modelPages.fetchNextPage()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {modelPages.isFetchingNextPage ? loadingLabel : loadMoreLabel}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>

      {selectedIds.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((modelId) => (
            <Badge
              className="max-w-full gap-1 pl-2"
              key={modelId}
              variant="secondary"
            >
              <span className="truncate font-mono text-[11px]">{modelId}</span>
              <button
                aria-label={removeLabel(modelId)}
                className="rounded-sm p-0.5 hover:bg-foreground/10"
                onClick={() => toggleModel(modelId)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
