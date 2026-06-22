'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { LayoutGrid, LayoutList, Search } from '@tuturuuu/icons/lucide';
import type { GatewayModelRowsPage } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useMemo, useState } from 'react';
import { ModelCardItem } from './model-card-item';
import { interpolateShowingCount } from './model-format';
import { ModelListItem } from './model-list-item';
import type {
  FetchModelsPage,
  ModelFilterOptions,
  ModelsMessages,
} from './models-types';

type ModelsPageProps = {
  fetchModelsPage: FetchModelsPage;
  filterOptions: ModelFilterOptions;
  initialPage: GatewayModelRowsPage;
  messages: ModelsMessages;
};

export function ModelsPage({
  fetchModelsPage,
  filterOptions,
  initialPage,
  messages,
}: ModelsPageProps) {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const usesInitialPage =
    search.trim().length === 0 &&
    providerFilter === 'all' &&
    typeFilter === 'all' &&
    tagFilter === 'all';

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<GatewayModelRowsPage>({
    queryKey: [
      'marketing-models',
      { providerFilter, search, tagFilter, typeFilter },
    ],
    queryFn: ({ pageParam }) =>
      fetchModelsPage({
        page: Number(pageParam),
        provider: providerFilter,
        search,
        tag: tagFilter,
        type: typeFilter,
      }),
    initialData: usesInitialPage
      ? { pageParams: [1], pages: [initialPage] }
      : undefined,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.pagination.page + 1;
      const loaded = lastPage.pagination.page * lastPage.pagination.limit;

      return loaded < lastPage.pagination.total ? nextPage : undefined;
    },
  });

  const loadedModels = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data]
  );
  const totalModels = data?.pages.at(-1)?.pagination.total ?? 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-16 md:py-24">
      <div className="mb-12 text-center">
        <h1 className="mb-4 font-bold text-4xl text-foreground sm:text-5xl md:text-6xl">
          {messages.title}
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground text-xl">
          {messages.subtitle}
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={messages.search_placeholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-background pl-9"
          />
        </div>

        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger>
            <SelectValue placeholder={messages.filter_provider} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{messages.all_providers}</SelectItem>
            {filterOptions.providers.map((provider) => (
              <SelectItem
                key={provider}
                value={provider}
                className="capitalize"
              >
                {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger>
            <SelectValue placeholder={messages.filter_type} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{messages.all_types}</SelectItem>
            {filterOptions.types.map((type) => (
              <SelectItem key={type} value={type} className="capitalize">
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger>
            <SelectValue placeholder={messages.filter_tag} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{messages.all_tags}</SelectItem>
            {filterOptions.tags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {interpolateShowingCount(messages.showing_count, {
            count: loadedModels.length,
            total: totalModels,
          })}
        </p>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (value === 'grid' || value === 'list') {
              setViewMode(value);
            }
          }}
          className="inline-flex gap-0.5 rounded-lg border bg-muted/40 p-0.5"
          aria-label={messages.view_mode}
        >
          <ToggleGroupItem
            value="grid"
            aria-label={messages.view_grid}
            className="h-8 rounded-md px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            aria-label={messages.view_list}
            className="h-8 rounded-md px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            <LayoutList className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isLoading ? (
        <ModelsLoadingGrid />
      ) : isError ? (
        <ModelsMessagePanel message={messages.load_failed} />
      ) : loadedModels.length === 0 ? (
        <ModelsMessagePanel message={messages.no_results} />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loadedModels.map((model) => (
            <ModelCardItem key={model.id} messages={messages} model={model} />
          ))}
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-background">
          {loadedModels.map((model) => (
            <ModelListItem key={model.id} messages={messages} model={model} />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-8">
          <Button
            variant="outline"
            onClick={() => {
              void fetchNextPage();
            }}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? messages.loading_more : messages.load_more}
          </Button>
        </div>
      )}
    </div>
  );
}

function ModelsLoadingGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="h-72 animate-pulse rounded-xl border bg-muted/50"
        />
      ))}
    </div>
  );
}

function ModelsMessagePanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border bg-muted/50 py-20 text-center">
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );
}
