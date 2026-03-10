'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import {
  ArrowBigUpDash,
  Check,
  ChevronDown,
  Layers,
  Loader2,
  Lock,
  Search,
  Star,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIModelUI } from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchGatewayFavoriteModels,
  fetchGatewayModelsPage,
  fetchGatewayProviders,
  type GatewayModelProviderSummary,
  MAX_PAGINATION_ITEMS,
  MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY,
  MIRA_GATEWAY_PROVIDERS_QUERY_KEY,
  sortModelsForDisplay,
} from './mira-gateway-models';
import { ProviderLogo, toProviderId } from './provider-logo';

const EMPTY_FAVORITES = new Set<string>();
const EMPTY_PROVIDER_SUMMARIES: GatewayModelProviderSummary[] = [];

type ModelListProps = {
  defaultModelId: string | null;
  fillHeight?: boolean;
  hasNextPage?: boolean;
  isEmptyMessage: string;
  isFavorited: (modelId: string) => boolean;
  isFetchingNextPage?: boolean;
  isModelAllowed: (model: AIModelUI) => boolean;
  model: AIModelUI;
  models: AIModelUI[];
  onLoadMore?: () => void;
  onSelectModel: (model: AIModelUI) => void;
  onToggleFavorite: (
    event: React.MouseEvent<HTMLButtonElement>,
    modelId: string,
    modelLabel: string
  ) => void;
  pendingModelId: string | null;
};

type ProviderModelsSectionProps = {
  defaultModelId: string | null;
  enabled: boolean;
  hideLockedModels: boolean;
  isFavorited: (modelId: string) => boolean;
  isModelAllowed: (model: AIModelUI) => boolean;
  model: AIModelUI;
  onSelectModel: (model: AIModelUI) => void;
  onToggleFavorite: (
    event: React.MouseEvent<HTMLButtonElement>,
    modelId: string,
    modelLabel: string
  ) => void;
  pendingModelId: string | null;
  provider: string;
  search: string;
};

const providerLogoStatus = new Map<string, boolean>();

function hasProviderLogo(provider: string): boolean {
  return providerLogoStatus.get(provider) ?? false;
}

async function checkProviderLogo(provider: string): Promise<boolean> {
  const id = toProviderId(provider);
  const url = `https://models.dev/logos/${id}.svg`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    if (text.includes('M9.8132 15.9038')) return false;
    return true;
  } catch {
    return false;
  }
}

interface MiraModelSelectorProps {
  creditsWsId?: string;
  wsId: string;
  model: AIModelUI;
  onChange: (model: AIModelUI) => void;
  disabled?: boolean;
  hotkeySignal?: number;
  shortcutLabel?: string;
}

async function fetchFavorites(wsId: string): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ai_model_favorites')
    .select('model_id')
    .eq('ws_id', wsId);

  if (error || !data?.length) return new Set();
  return new Set(data.map((row) => row.model_id));
}

async function toggleFavorite(
  wsId: string,
  modelId: string,
  isFavorited: boolean
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Authentication required');
  }

  if (isFavorited) {
    const { error } = await supabase
      .from('ai_model_favorites')
      .delete()
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .eq('model_id', modelId);

    if (error) {
      throw new Error(error.message || 'Failed to update favorites');
    }

    return;
  }

  const { error } = await supabase.from('ai_model_favorites').insert({
    ws_id: wsId,
    user_id: user.id,
    model_id: modelId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update favorites');
  }
}

function formatProvider(provider: string): string {
  return provider
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function modelMatchesSearch(model: AIModelUI, search: string): boolean {
  if (!search.trim()) return true;
  const query = search.toLowerCase().trim();

  return (
    model.label.toLowerCase().includes(query) ||
    model.provider.toLowerCase().includes(query) ||
    model.value.toLowerCase().includes(query) ||
    (model.description?.toLowerCase().includes(query) ?? false)
  );
}

function ModelList({
  defaultModelId,
  fillHeight = false,
  hasNextPage,
  isEmptyMessage,
  isFavorited,
  isFetchingNextPage,
  isModelAllowed,
  model,
  models,
  onLoadMore,
  onSelectModel,
  onToggleFavorite,
  pendingModelId,
}: ModelListProps) {
  const t = useTranslations('dashboard.mira_chat');
  const scrollContainerClassName = fillHeight
    ? 'min-h-0 flex-1 overflow-y-auto'
    : 'max-h-64 overflow-y-auto';

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden',
        fillHeight && 'min-h-0 flex-1'
      )}
    >
      <div
        className={cn('relative w-full min-w-0', scrollContainerClassName)}
        onScroll={(event) => {
          if (!onLoadMore || !hasNextPage || isFetchingNextPage) return;

          const target = event.currentTarget;
          const isNearBottom =
            target.scrollTop + target.clientHeight >= target.scrollHeight - 24;

          if (isNearBottom) {
            onLoadMore();
          }
        }}
      >
        <CommandGroup
          className={cn(
            'px-0 py-0 text-foreground **:[[cmdk-group-heading]]:hidden',
            isFetchingNextPage && 'pb-12'
          )}
        >
          {models.length === 0 ? (
            <div className="px-3 py-6 text-center text-muted-foreground text-sm">
              {isEmptyMessage}
            </div>
          ) : (
            models.map((itemModel) => {
              const allowed = isModelAllowed(itemModel);
              const favorited = isFavorited(itemModel.value);
              const isPlanDefault = itemModel.value === defaultModelId;

              const item = (
                <CommandItem
                  key={itemModel.value}
                  value={`${itemModel.provider} ${itemModel.label} ${itemModel.value} ${itemModel.description ?? ''}`}
                  onSelect={() => {
                    if (!allowed) return;
                    onSelectModel(itemModel);
                  }}
                  className={cn(
                    'flex items-start gap-2 py-2',
                    !allowed && 'cursor-not-allowed opacity-50'
                  )}
                  aria-disabled={!allowed}
                >
                  <ProviderLogo
                    provider={itemModel.provider}
                    size={18}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-start gap-1.5">
                      {allowed ? (
                        <Check
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            model.value === itemModel.value
                              ? 'opacity-100'
                              : 'hidden'
                          )}
                        />
                      ) : (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium font-mono text-xs">
                        {itemModel.label}
                      </span>
                      {isPlanDefault && (
                        <span className="rounded-full border border-dynamic-primary/25 bg-dynamic-primary/10 px-1.5 py-0.5 font-sans text-[8px] text-dynamic-primary uppercase tracking-[0.16em]">
                          {t('model_default_badge')}
                        </span>
                      )}
                      <button
                        type="button"
                        className="group ml-auto flex shrink-0 rounded p-0.5 hover:bg-muted"
                        onClick={(event) =>
                          onToggleFavorite(
                            event,
                            itemModel.value,
                            itemModel.label
                          )
                        }
                        disabled={pendingModelId === itemModel.value}
                        aria-label={
                          favorited
                            ? t('model_unfavorite')
                            : t('model_favorite')
                        }
                        title={
                          favorited
                            ? t('model_unfavorite')
                            : t('model_favorite')
                        }
                      >
                        <Star
                          className={cn(
                            'h-3.5 w-3.5 transition-[fill]',
                            favorited && 'fill-current',
                            !favorited &&
                              'fill-transparent group-hover:fill-current'
                          )}
                        />
                      </button>
                    </div>
                    {itemModel.tags?.length ? (
                      <div className="flex flex-wrap items-center gap-1 opacity-60">
                        {itemModel.tags.map((tag) => (
                          <span
                            key={tag}
                            className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[8px] uppercase leading-none"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {itemModel.description ? (
                      <p className="mt-0.5 line-clamp-2 pr-4 text-[10px] text-muted-foreground">
                        {itemModel.description}
                      </p>
                    ) : null}
                  </div>
                </CommandItem>
              );

              if (allowed) return item;

              return (
                <Tooltip key={itemModel.value}>
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{t('model_upgrade_required')}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })
          )}
        </CommandGroup>
        {isFetchingNextPage ? (
          <div className="pointer-events-none sticky right-0 bottom-0 left-0 flex items-center justify-center bg-linear-to-t from-background via-background/95 to-transparent px-3 py-3">
            <div className="rounded-full border bg-background/95 px-3 py-1 shadow-sm backdrop-blur-sm">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProviderModelsSection({
  defaultModelId,
  enabled,
  hideLockedModels,
  isFavorited,
  isModelAllowed,
  model,
  onSelectModel,
  onToggleFavorite,
  pendingModelId,
  provider,
  search,
}: ProviderModelsSectionProps) {
  const t = useTranslations('dashboard.mira_chat');
  const providerModelsQuery = useInfiniteQuery({
    queryKey: [MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY, { provider, search }],
    queryFn: ({ pageParam }) =>
      fetchGatewayModelsPage({
        limit: MAX_PAGINATION_ITEMS,
        offset: typeof pageParam === 'number' ? pageParam : 0,
        provider,
        search,
      }),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 5 * 60 * 1000,
  });

  const models = useMemo(() => {
    const items =
      providerModelsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const filteredByLocked = hideLockedModels
      ? items.filter((item) => isModelAllowed(item))
      : items;
    const filteredItems = filteredByLocked.filter((item) =>
      modelMatchesSearch(item, search)
    );
    const modelsById = new Map(filteredItems.map((item) => [item.value, item]));

    return sortModelsForDisplay(filteredItems, {
      defaultModelId,
      isFavorited,
      isModelAllowed: (modelId) => {
        const providerModel = modelsById.get(modelId);
        return providerModel ? isModelAllowed(providerModel) : false;
      },
    });
  }, [
    defaultModelId,
    hideLockedModels,
    isFavorited,
    isModelAllowed,
    providerModelsQuery.data,
    search,
  ]);

  return (
    <AccordionItem value={provider} className="w-full min-w-0 border-b-0">
      <AccordionTrigger
        className="w-full min-w-0 px-3 py-2 font-semibold text-muted-foreground text-xs hover:no-underline"
        showChevron={true}
      >
        <div className="flex items-center gap-2">
          <ProviderLogo provider={provider} size={14} className="shrink-0" />
          <span className="capitalize">{formatProvider(provider)}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="w-full min-w-0 overflow-hidden pt-0 pb-2">
        {providerModelsQuery.isLoading ? (
          <div className="flex items-center justify-center px-3 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full min-w-0 px-3">
            <ModelList
              defaultModelId={defaultModelId}
              hasNextPage={providerModelsQuery.hasNextPage}
              isEmptyMessage={t('model_selector_empty')}
              isFavorited={isFavorited}
              isFetchingNextPage={providerModelsQuery.isFetchingNextPage}
              isModelAllowed={isModelAllowed}
              model={model}
              models={models}
              onLoadMore={() => {
                if (!providerModelsQuery.hasNextPage) return;
                void providerModelsQuery.fetchNextPage();
              }}
              onSelectModel={onSelectModel}
              onToggleFavorite={onToggleFavorite}
              pendingModelId={pendingModelId}
            />
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function MiraModelSelector({
  creditsWsId,
  wsId,
  model,
  onChange,
  disabled,
  hotkeySignal,
  shortcutLabel,
}: MiraModelSelectorProps) {
  const t = useTranslations('dashboard.mira_chat');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [hideLockedModels, setHideLockedModels] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<string[]>([]);
  const deferredOpen = useDeferredValue(open);
  const hasAppliedInitialFavoritesView = useRef(false);
  const hasInitializedAllProviders = useRef(false);

  const { data: favoriteIds, isLoading: favoritesLoading } = useQuery({
    queryKey: ['ai-model-favorites', wsId],
    queryFn: () => fetchFavorites(wsId),
    enabled: !!wsId,
    staleTime: 60 * 1000,
  });

  const { data: credits } = useAiCredits(creditsWsId ?? wsId);
  const showUpgradeCta = credits?.tier === 'FREE';
  const defaultModelId = credits?.defaultLanguageModel ?? null;
  const allowedModels = credits?.allowedModels ?? [];
  const hasFavorites =
    !favoritesLoading && !!favoriteIds && favoriteIds.size > 0;
  const isAllModelsView = !favoritesOnly && !selectedProvider;
  const isSingleProviderView = !favoritesOnly && !!selectedProvider;

  const providerSummariesQuery = useQuery({
    queryKey: [
      MIRA_GATEWAY_PROVIDERS_QUERY_KEY,
      { allowedModels, hideLockedModels },
    ],
    queryFn: () =>
      fetchGatewayProviders({
        allowedModels,
        hideLockedModels,
      }),
    enabled: deferredOpen,
    staleTime: 5 * 60 * 1000,
  });

  const providerList = useMemo(() => {
    return [...(providerSummariesQuery.data ?? EMPTY_PROVIDER_SUMMARIES)].sort(
      (a, b) => {
        if (a.allowedCount !== b.allowedCount) {
          return a.allowedCount > 0 ? -1 : 1;
        }

        const aHasLogo = hasProviderLogo(a.provider);
        const bHasLogo = hasProviderLogo(b.provider);
        if (aHasLogo !== bHasLogo) return aHasLogo ? -1 : 1;

        return a.provider.localeCompare(b.provider);
      }
    );
  }, [providerSummariesQuery.data]);

  useQuery({
    queryKey: [
      'provider-logos',
      providerList.map((provider) => provider.provider).join(','),
    ],
    queryFn: async () => {
      await Promise.all(
        providerList.map(async ({ provider }) => {
          if (providerLogoStatus.has(provider)) return;
          const hasLogo = await checkProviderLogo(provider);
          providerLogoStatus.set(provider, hasLogo);
        })
      );

      return true;
    },
    enabled: providerList.length > 0,
    staleTime: Infinity,
  });

  const favoriteModelsQuery = useQuery({
    queryKey: ['ai-model-favorites-models', wsId],
    queryFn: () => fetchGatewayFavoriteModels(wsId),
    enabled: deferredOpen && favoritesOnly && !!wsId,
    staleTime: 60 * 1000,
  });

  const selectedProviderModelsQuery = useInfiniteQuery({
    queryKey: [
      MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY,
      { provider: selectedProvider, search },
    ],
    queryFn: ({ pageParam }) =>
      fetchGatewayModelsPage({
        limit: MAX_PAGINATION_ITEMS,
        offset: typeof pageParam === 'number' ? pageParam : 0,
        provider: selectedProvider ?? '',
        search,
      }),
    enabled: deferredOpen && !!selectedProvider && !favoritesOnly,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!deferredOpen) {
      hasAppliedInitialFavoritesView.current = false;
      hasInitializedAllProviders.current = false;
      return;
    }

    if (hasAppliedInitialFavoritesView.current || favoritesLoading) return;

    setFavoritesOnly(hasFavorites);
    hasAppliedInitialFavoritesView.current = true;
  }, [deferredOpen, favoritesLoading, hasFavorites]);

  useEffect(() => {
    if (!hotkeySignal || disabled) return;
    setOpen(true);
  }, [hotkeySignal, disabled]);

  useEffect(() => {
    if (!isAllModelsView) return;
    if (hasInitializedAllProviders.current) return;

    const firstProvider = providerList[0]?.provider;
    if (firstProvider) {
      setExpandedProviders([firstProvider]);
      hasInitializedAllProviders.current = true;
    }
  }, [isAllModelsView, providerList]);

  useEffect(() => {
    const validProviders = new Set(
      providerList.map((provider) => provider.provider)
    );

    setExpandedProviders((current) => {
      const next = current.filter((provider) => validProviders.has(provider));
      return next.length === current.length ? current : next;
    });

    if (selectedProvider && !validProviders.has(selectedProvider)) {
      setSelectedProvider(null);
    }
  }, [providerList, selectedProvider]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({
      modelId,
      isFavorited,
    }: {
      modelId: string;
      modelLabel: string;
      isFavorited: boolean;
    }) => toggleFavorite(wsId, modelId, isFavorited),
    onSuccess: (_, { modelLabel, isFavorited }) => {
      void queryClient.invalidateQueries({
        queryKey: ['ai-model-favorites', wsId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['ai-model-favorites-models', wsId],
      });

      const message = isFavorited
        ? t('model_removed_from_favorites', { model: modelLabel })
        : t('model_added_to_favorites', { model: modelLabel });
      toast.success(message);
    },
    onError: (error, { modelId, modelLabel, isFavorited }) => {
      void queryClient.invalidateQueries({
        queryKey: ['ai-model-favorites', wsId],
      });
      const action = isFavorited ? t('model_unfavorite') : t('model_favorite');
      const fallbackMessage = `${t('error')} (${action}: ${modelLabel} - ${modelId})`;
      const details = error instanceof Error ? error.message : '';
      toast.error(details ? `${fallbackMessage}: ${details}` : fallbackMessage);
    },
  });

  const isFavorited = useCallback(
    (modelId: string) => (favoriteIds ?? EMPTY_FAVORITES).has(modelId),
    [favoriteIds]
  );

  const isModelAllowed = useCallback(
    (candidateModel: AIModelUI) => {
      if (candidateModel.disabled) return false;
      return matchesAllowedModel(candidateModel.value, allowedModels);
    },
    [allowedModels]
  );

  const handleToggleFavorite = useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      modelId: string,
      modelLabel: string
    ) => {
      event.stopPropagation();
      const favorited = isFavorited(modelId);
      setPendingModelId(modelId);

      toggleFavoriteMutation.mutate(
        {
          modelId,
          modelLabel,
          isFavorited: favorited,
        },
        {
          onSuccess: () => setPendingModelId(null),
          onError: () => setPendingModelId(null),
        }
      );
    },
    [isFavorited, toggleFavoriteMutation]
  );

  const favoriteModels = useMemo(() => {
    const models = favoriteModelsQuery.data ?? [];
    const visibleModels = hideLockedModels
      ? models.filter((item) => isModelAllowed(item))
      : models;

    return visibleModels
      .filter((item) => modelMatchesSearch(item, search))
      .sort((a, b) => {
        const providerOrder = a.provider.localeCompare(b.provider);
        if (providerOrder !== 0) return providerOrder;
        return a.label.localeCompare(b.label);
      });
  }, [favoriteModelsQuery.data, hideLockedModels, isModelAllowed, search]);

  const selectedProviderModels = useMemo(() => {
    const items =
      selectedProviderModelsQuery.data?.pages.flatMap((page) => page.items) ??
      [];
    const filteredByLocked = hideLockedModels
      ? items.filter((item) => isModelAllowed(item))
      : items;
    const filteredItems = filteredByLocked.filter((item) =>
      modelMatchesSearch(item, search)
    );
    const modelsById = new Map(filteredItems.map((item) => [item.value, item]));

    return sortModelsForDisplay(filteredItems, {
      defaultModelId,
      isFavorited,
      isModelAllowed: (modelId) => {
        const selectedModel = modelsById.get(modelId);
        return selectedModel ? isModelAllowed(selectedModel) : false;
      },
    });
  }, [
    defaultModelId,
    hideLockedModels,
    isFavorited,
    isModelAllowed,
    search,
    selectedProviderModelsQuery.data,
  ]);

  const selectModel = useCallback(
    (nextModel: AIModelUI) => {
      onChange(nextModel);
      setOpen(false);
    },
    [onChange]
  );

  const providerNames = providerList.map((provider) => provider.provider);
  const isLoadingRootPane =
    !deferredOpen ||
    providerSummariesQuery.isLoading ||
    (favoritesOnly && favoriteModelsQuery.isLoading) ||
    (isSingleProviderView && selectedProviderModelsQuery.isLoading);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-0 max-w-full gap-2 rounded-full px-3 font-mono text-muted-foreground text-sm"
              disabled={disabled}
            >
              <ProviderLogo provider={model.provider} size={16} />
              <span className="min-w-0 truncate">{model.label}</span>
              {defaultModelId === model.value ? (
                <span className="rounded-full bg-dynamic-primary/12 px-2 py-0.5 font-sans text-[10px] text-dynamic-primary uppercase tracking-[0.18em]">
                  {t('model_default_badge')}
                </span>
              ) : null}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {shortcutLabel ? (
          <TooltipContent>{`${t('model_picker')} (${shortcutLabel})`}</TooltipContent>
        ) : null}
      </Tooltip>
      <PopoverContent
        className="flex h-[min(480px,85vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        align="start"
        sideOffset={4}
      >
        <TooltipProvider delayDuration={200}>
          {showUpgradeCta ? (
            <div className="m-2 mb-0 rounded-xl border border-dynamic-primary/25 bg-linear-to-r from-dynamic-primary/20 via-dynamic-secondary/15 to-dynamic-purple/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">
                    {t('model_unlock_more_title')}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                    {t('model_unlock_more_description')}
                  </p>
                </div>
                <Link
                  href={`/${wsId}/billing`}
                  className={cn(
                    'group flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg transition-all duration-200',
                    'border border-dynamic-purple/20 bg-linear-to-r from-dynamic-purple/10 to-dynamic-indigo/8',
                    'text-dynamic-purple hover:border-dynamic-purple/35',
                    'hover:[box-shadow:0_0_20px_-5px_oklch(var(--dynamic-purple)/0.3)]',
                    'px-3 font-medium text-sm'
                  )}
                >
                  <ArrowBigUpDash className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {t('model_upgrade_cta')}
                </Link>
              </div>
            </div>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="relative min-w-0 flex-1 sm:max-w-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder={t('model_selector_search')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-background/50 py-1.5 pr-3 pl-9 text-foreground text-sm placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-muted-foreground text-xs">
                {t('model_hide_locked')}
              </span>
              <Switch
                checked={hideLockedModels}
                onCheckedChange={setHideLockedModels}
                aria-label={t('model_hide_locked')}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full min-h-0 shrink-0 border-r">
              <div className="flex flex-col gap-1 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'mx-1 h-8 w-8',
                        favoritesOnly && 'bg-muted'
                      )}
                      onClick={() => {
                        setFavoritesOnly((value) => !value);
                        setSelectedProvider(null);
                      }}
                      aria-label={t('model_show_favorites')}
                    >
                      <Star
                        className={cn(
                          'h-4 w-4',
                          favoritesOnly && 'fill-current'
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{t('model_show_favorites')}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'mx-1 h-8 w-8',
                        !favoritesOnly && !selectedProvider && 'bg-muted'
                      )}
                      onClick={() => {
                        setFavoritesOnly(false);
                        setSelectedProvider(null);
                        if (providerNames[0]) {
                          setExpandedProviders([providerNames[0]]);
                        }
                      }}
                      aria-label={t('model_show_all')}
                    >
                      <Layers className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">
                      {t('model_show_all') ?? 'All Models'}
                    </p>
                  </TooltipContent>
                </Tooltip>

                <div className="px-3 py-1">
                  <Separator className="bg-border/50" />
                </div>

                {providerNames.map((provider) => (
                  <Tooltip key={provider}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'mx-1 h-8 w-8',
                          selectedProvider === provider && 'bg-muted'
                        )}
                        onClick={() => {
                          const nextProvider =
                            selectedProvider === provider ? null : provider;
                          setSelectedProvider(nextProvider);
                          if (nextProvider) {
                            setFavoritesOnly(false);
                          }
                        }}
                        aria-label={formatProvider(provider)}
                      >
                        <ProviderLogo provider={provider} size={18} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs">{formatProvider(provider)}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </ScrollArea>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {isLoadingRootPane ? (
                <div className="flex min-h-0 flex-1 items-center justify-center py-12">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : favoritesOnly ? (
                <Command
                  className="flex min-h-0 flex-1 flex-col"
                  shouldFilter={false}
                >
                  <CommandList className="flex min-h-0 flex-1 flex-col border-0 px-3 py-2">
                    <ModelList
                      defaultModelId={defaultModelId}
                      fillHeight={true}
                      isEmptyMessage={t('model_selector_empty')}
                      isFavorited={isFavorited}
                      isModelAllowed={isModelAllowed}
                      model={model}
                      models={favoriteModels}
                      onSelectModel={selectModel}
                      onToggleFavorite={handleToggleFavorite}
                      pendingModelId={pendingModelId}
                    />
                  </CommandList>
                </Command>
              ) : isSingleProviderView && selectedProvider ? (
                <Command
                  className="flex min-h-0 flex-1 flex-col"
                  shouldFilter={false}
                >
                  <div className="w-full shrink-0 border-b px-3 py-2 font-semibold text-muted-foreground text-xs">
                    <div className="flex items-center gap-2">
                      <ProviderLogo
                        provider={selectedProvider}
                        size={14}
                        className="shrink-0"
                      />
                      <span className="capitalize">
                        {formatProvider(selectedProvider)}
                      </span>
                    </div>
                  </div>
                  <CommandList className="flex min-h-0 flex-1 flex-col border-0 px-3 py-2">
                    <ModelList
                      defaultModelId={defaultModelId}
                      fillHeight={true}
                      hasNextPage={selectedProviderModelsQuery.hasNextPage}
                      isEmptyMessage={t('model_selector_empty')}
                      isFavorited={isFavorited}
                      isFetchingNextPage={
                        selectedProviderModelsQuery.isFetchingNextPage
                      }
                      isModelAllowed={isModelAllowed}
                      model={model}
                      models={selectedProviderModels}
                      onLoadMore={() => {
                        if (!selectedProviderModelsQuery.hasNextPage) return;
                        void selectedProviderModelsQuery.fetchNextPage();
                      }}
                      onSelectModel={selectModel}
                      onToggleFavorite={handleToggleFavorite}
                      pendingModelId={pendingModelId}
                    />
                  </CommandList>
                </Command>
              ) : providerNames.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {t('model_selector_empty')}
                </div>
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <Command shouldFilter={false}>
                    <CommandList className="max-h-none w-full border-0 px-0 py-0">
                      <Accordion
                        type="multiple"
                        value={expandedProviders}
                        onValueChange={(value) =>
                          setExpandedProviders(
                            Array.isArray(value) ? value : []
                          )
                        }
                        className="w-full min-w-0"
                      >
                        {providerNames.map((provider) => (
                          <ProviderModelsSection
                            key={provider}
                            defaultModelId={defaultModelId}
                            enabled={expandedProviders.includes(provider)}
                            hideLockedModels={hideLockedModels}
                            isFavorited={isFavorited}
                            isModelAllowed={isModelAllowed}
                            model={model}
                            onSelectModel={selectModel}
                            onToggleFavorite={handleToggleFavorite}
                            pendingModelId={pendingModelId}
                            provider={provider}
                            search={search}
                          />
                        ))}
                      </Accordion>
                    </CommandList>
                  </Command>
                </ScrollArea>
              )}
            </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
