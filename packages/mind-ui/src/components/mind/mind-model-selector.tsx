'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronDown } from '@tuturuuu/icons';
import { listAiGatewayModelsPage } from '@tuturuuu/internal-api/infrastructure/ai';
import type { AIModelUI } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MIND_AI_MODELS } from './mind-ai-options';
import { ProviderLogo } from './provider-logo';

type Props = {
  model: AIModelUI;
  onModelChange: (model: AIModelUI) => void;
};

type MindModelsPage = Awaited<ReturnType<typeof listAiGatewayModelsPage>>;

export function MindModelSelector({ model, onModelChange }: Props) {
  const t = useTranslations('mind');
  const [search, setSearch] = useState('');
  const modelsQuery = useInfiniteQuery<
    MindModelsPage,
    Error,
    InfiniteData<MindModelsPage, number>,
    readonly ['mind', 'ai-models', 'language', string],
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
      listAiGatewayModelsPage({
        enabled: true,
        limit: 40,
        page: pageParam,
        q: search,
        type: 'language',
      }),
    queryKey: ['mind', 'ai-models', 'language', search],
    staleTime: 5 * 60 * 1000,
  });
  const pageModels = modelsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const fallbackModels =
    search || pageModels.length ? pageModels : MIND_AI_MODELS;
  const models = useMemo(
    () => mergeModels([model], fallbackModels),
    [fallbackModels, model]
  );
  const groups = useMemo(() => groupModels(models), [models]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="h-8 w-full min-w-0 justify-start gap-2 rounded-md px-3 font-mono text-muted-foreground text-sm"
          size="sm"
          type="button"
          variant="ghost"
        >
          <ProviderLogo provider={model.provider} size={16} />
          <span className="min-w-0 truncate">{model.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[min(24rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"
        sideOffset={6}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('ai.modelSearch')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-80">
            <CommandEmpty>
              {modelsQuery.isLoading ? t('ai.loadingModels') : t('ai.noModels')}
            </CommandEmpty>
            {groups.map(([provider, providerModels]) => (
              <CommandGroup
                heading={provider}
                key={provider}
                className="[&_[cmdk-group-heading]]:font-mono"
              >
                {providerModels.map((item) => (
                  <CommandItem
                    className="gap-2"
                    key={item.value}
                    onSelect={() => onModelChange(item)}
                    value={`${item.provider} ${item.label} ${item.value}`}
                  >
                    <ProviderLogo provider={item.provider} size={16} />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {item.tags?.includes('thinking') ? (
                      <Badge
                        className="h-5 px-1.5 text-[10px]"
                        variant="secondary"
                      >
                        {t('ai.thinkingBadge')}
                      </Badge>
                    ) : null}
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        item.value === model.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {modelsQuery.hasNextPage && (
              <div className="border-t p-2">
                <Button
                  className="w-full"
                  disabled={modelsQuery.isFetchingNextPage}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => modelsQuery.fetchNextPage()}
                >
                  {modelsQuery.isFetchingNextPage
                    ? t('ai.loadingMoreModels')
                    : t('ai.loadMoreModels')}
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function mergeModels(pinnedModels: AIModelUI[], models: AIModelUI[]) {
  const seen = new Set<string>();
  const merged: AIModelUI[] = [];

  for (const model of [...pinnedModels, ...models]) {
    if (seen.has(model.value)) continue;
    seen.add(model.value);
    merged.push(model);
  }

  return merged;
}

function groupModels(models: AIModelUI[]) {
  const groups = new Map<string, AIModelUI[]>();

  for (const model of models) {
    const providerModels = groups.get(model.provider) ?? [];
    providerModels.push(model);
    groups.set(model.provider, providerModels);
  }

  return [...groups.entries()].map(([provider, providerModels]) => [
    provider,
    providerModels.sort((a, b) => a.label.localeCompare(b.label)),
  ]) satisfies Array<[string, AIModelUI[]]>;
}
