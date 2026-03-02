'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ProviderLogo, toProviderId } from './provider-logo';

const EMPTY_FAVORITES = new Set<string>();
const EMPTY_GROUPED_MODELS: Record<string, AIModelUI[]> = {};
interface RenderedGroup {
  provider: string;
  models: AIModelUI[];
  isFavoritesGroup?: boolean;
}

const EMPTY_RENDERED_GROUPS: RenderedGroup[] = [];

// Logo status is fetched dynamically and stored in this map
const providerLogoStatus = new Map<string, boolean>();

// Synchronous check for immediate renders. Will be true if confirmed, false if confirmed missing or unknown
function hasProviderLogo(provider: string): boolean {
  return providerLogoStatus.get(provider) ?? false;
}

async function checkProviderLogo(provider: string): Promise<boolean> {
  const id = toProviderId(provider);
  const url = `https://models.dev/logos/${id}.svg`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    // length 1421 is the fallback spark icon (also used by Meta, so we exclude Meta/x-ai just in case or just rely on the text)
    if (text.includes('M9.8132 15.9038')) return false; // This is the fallback sparkles SVG path
    return true;
  } catch {
    return false;
  }
}

interface MiraModelSelectorProps {
  wsId: string;
  model: AIModelUI;
  onChange: (model: AIModelUI) => void;
  disabled?: boolean;
  hotkeySignal?: number;
  shortcutLabel?: string;
}

/** Fetches enabled models from the ai_gateway_models table */
async function fetchGatewayModels(): Promise<AIModelUI[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ai_gateway_models')
    .select(
      'id, name, provider, description, context_window, max_tokens, type, tags, is_enabled, input_price_per_token, output_price_per_token'
    )
    .eq('type', 'language')
    .order('provider')
    .order('name');

  if (error || !data?.length) return [];

  return data.map((m) => {
    const inputPricePerToken = Number(m.input_price_per_token ?? 0);
    const outputPricePerToken = Number(m.output_price_per_token ?? 0);

    return {
      value: m.id,
      label: m.name,
      provider: m.provider,
      description: m.description ?? undefined,
      context: m.context_window ?? undefined,
      maxTokens: m.max_tokens ?? undefined,
      tags: m.tags ?? undefined,
      disabled: !m.is_enabled,
      inputPricePerToken:
        Number.isFinite(inputPricePerToken) && inputPricePerToken > 0
          ? inputPricePerToken
          : undefined,
      outputPricePerToken:
        Number.isFinite(outputPricePerToken) && outputPricePerToken > 0
          ? outputPricePerToken
          : undefined,
    } as AIModelUI & {
      maxTokens?: number;
      tags?: string[];
      inputPricePerToken?: number;
      outputPricePerToken?: number;
    };
  });
}

async function fetchFavorites(wsId: string): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ai_model_favorites')
    .select('model_id')
    .eq('ws_id', wsId);

  if (error || !data?.length) return new Set();
  return new Set(data.map((r) => r.model_id));
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
  } else {
    const { error } = await supabase.from('ai_model_favorites').insert({
      ws_id: wsId,
      user_id: user.id,
      model_id: modelId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to update favorites');
    }
  }
}

/** Capitalize first letter of each word for display */
function formatProvider(provider: string): string {
  return provider
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function modelMatchesSearch(m: AIModelUI, search: string): boolean {
  if (!search.trim()) return true;
  const q = search.toLowerCase().trim();
  return (
    m.label.toLowerCase().includes(q) ||
    m.provider.toLowerCase().includes(q) ||
    m.value.toLowerCase().includes(q) ||
    (m.description?.toLowerCase().includes(q) ?? false)
  );
}

export default function MiraModelSelector({
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
  const [accordionValue, setAccordionValue] = useState<string[]>([]);
  const deferredOpen = useDeferredValue(open);
  const hasAppliedInitialFavoritesView = useRef(false);

  const { data: gatewayModels, isLoading: modelsLoading } = useQuery({
    queryKey: ['ai-gateway-models', 'enabled'],
    queryFn: fetchGatewayModels,
    staleTime: 5 * 60 * 1000,
  });

  const { data: favoriteIds, isLoading: favoritesLoading } = useQuery({
    queryKey: ['ai-model-favorites', wsId],
    queryFn: () => fetchFavorites(wsId),
    enabled: !!wsId,
    staleTime: 60 * 1000,
  });

  const hasFavorites =
    !favoritesLoading && !!favoriteIds && favoriteIds.size > 0;

  useEffect(() => {
    if (!deferredOpen) {
      hasAppliedInitialFavoritesView.current = false;
      return;
    }
    if (hasAppliedInitialFavoritesView.current) return;
    if (favoritesLoading) return;

    setFavoritesOnly(hasFavorites);
    hasAppliedInitialFavoritesView.current = true;
  }, [deferredOpen, favoritesLoading, hasFavorites]);

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
      queryClient.invalidateQueries({ queryKey: ['ai-model-favorites', wsId] });
      const message = isFavorited
        ? t('model_removed_from_favorites', { model: modelLabel })
        : t('model_added_to_favorites', { model: modelLabel });
      toast.success(message);
    },
    onError: (error, { modelId, modelLabel, isFavorited }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-model-favorites', wsId] });
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

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, modelId: string, modelLabel: string) => {
      e.stopPropagation();
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

  const availableModels = useMemo(() => {
    return gatewayModels ?? [];
  }, [gatewayModels]);

  // Fetch logo status for all available providers
  useQuery({
    queryKey: [
      'provider-logos',
      availableModels.map((m) => m.provider).join(','),
    ],
    queryFn: async () => {
      const uniqueProviders = Array.from(
        new Set(availableModels.map((m) => m.provider))
      );
      const promises = uniqueProviders.map(async (p) => {
        if (providerLogoStatus.has(p)) return; // Already checked
        const hasLogo = await checkProviderLogo(p);
        providerLogoStatus.set(p, hasLogo);
      });
      await Promise.all(promises);
      return true; // Just tickle re-render
    },
    enabled: availableModels.length > 0,
    staleTime: Infinity,
  });

  const { data: credits } = useAiCredits(wsId);
  const showUpgradeCta = credits?.tier === 'FREE';

  const allowedModelIds = useMemo(() => {
    if (!credits?.allowedModels?.length) return null;
    return new Set(credits.allowedModels);
  }, [credits?.allowedModels]);

  const modelById = useMemo(() => {
    return new Map(availableModels.map((m) => [m.value, m] as const));
  }, [availableModels]);

  const allowedModelLookup = useMemo(() => {
    if (!allowedModelIds) return null;
    const lookup = new Set<string>();
    for (const id of allowedModelIds) {
      lookup.add(id);
      const bare = id.includes('/') ? id.split('/').pop() : id;
      if (bare) lookup.add(bare);
    }
    return lookup;
  }, [allowedModelIds]);

  const isModelAllowed = useCallback(
    (modelId: string) => {
      const m = modelById.get(modelId);
      if (m?.disabled) return false;

      if (!allowedModelLookup) return true;
      if (allowedModelLookup.has(modelId)) return true;
      const bare = modelId.includes('/') ? modelId.split('/').pop() : modelId;
      return bare ? allowedModelLookup.has(bare) : false;
    },
    [allowedModelLookup, modelById]
  );

  const groupedModels = useMemo(() => {
    if (!deferredOpen) return EMPTY_GROUPED_MODELS;

    const groups: Record<string, AIModelUI[]> = {};
    for (const m of availableModels) {
      const key = m.provider;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }

    for (const key in groups) {
      groups[key]?.sort((a, b) => {
        const aAllowed = isModelAllowed(a.value);
        const bAllowed = isModelAllowed(b.value);

        if (aAllowed !== bAllowed) return aAllowed ? -1 : 1;

        const aFav = isFavorited(a.value);
        const bFav = isFavorited(b.value);
        if (aFav !== bFav) return aFav ? -1 : 1;

        return a.label.localeCompare(b.label);
      });
    }

    return groups;
  }, [availableModels, deferredOpen, isModelAllowed, isFavorited]);

  const providerList = useMemo(() => {
    return Object.keys(groupedModels).sort((a, b) => {
      const aHasAllowed = groupedModels[a]?.some((m) =>
        isModelAllowed(m.value)
      );
      const bHasAllowed = groupedModels[b]?.some((m) =>
        isModelAllowed(m.value)
      );

      if (aHasAllowed !== bHasAllowed) return aHasAllowed ? -1 : 1;

      const aHasLogo = hasProviderLogo(a);
      const bHasLogo = hasProviderLogo(b);
      if (aHasLogo !== bHasLogo) return aHasLogo ? -1 : 1;

      return a.localeCompare(b);
    });
  }, [groupedModels, isModelAllowed]);

  const filteredProviderList = useMemo(() => {
    if (!hideLockedModels) return providerList;
    return providerList.filter((provider) =>
      groupedModels[provider]?.some((m) => isModelAllowed(m.value))
    );
  }, [groupedModels, hideLockedModels, isModelAllowed, providerList]);

  const providersToShow = useMemo(() => {
    if (selectedProvider) return [selectedProvider];
    return filteredProviderList;
  }, [selectedProvider, filteredProviderList]);

  const modelsToRender = useMemo(() => {
    if (!deferredOpen) return EMPTY_RENDERED_GROUPS;

    const result: RenderedGroup[] = [];

    if (favoritesOnly) {
      // Favorites: show ALL favorited models across all providers in one group
      let models = Object.keys(groupedModels)
        .flatMap((key) => groupedModels[key] ?? [])
        .filter((m) => isFavorited(m.value));

      if (hideLockedModels) {
        models = models.filter((m) => isModelAllowed(m.value));
      }

      models = models.filter((m) => modelMatchesSearch(m, search));

      models.sort((a, b) => {
        const providerOrder = a.provider.localeCompare(b.provider);
        if (providerOrder !== 0) return providerOrder;
        return a.label.localeCompare(b.label);
      });

      if (models.length > 0) {
        result.push({
          provider: 'favorites',
          models,
          isFavoritesGroup: true,
        });
      }
      return result;
    }

    // Normal view: group by provider (respecting selectedProvider)
    for (const provider of providersToShow) {
      let models = groupedModels[provider] ?? [];

      if (hideLockedModels) {
        models = models.filter((m) => isModelAllowed(m.value));
      }

      models = models.filter((m) => modelMatchesSearch(m, search));

      if (models.length > 0) {
        result.push({ provider, models });
      }
    }

    return result;
  }, [
    deferredOpen,
    providersToShow,
    groupedModels,
    hideLockedModels,
    favoritesOnly,
    search,
    isModelAllowed,
    isFavorited,
  ]);

  useEffect(() => {
    if (!deferredOpen || modelsToRender.length === 0) {
      setAccordionValue([]);
      return;
    }

    // When there is only a single section (e.g. Favorites, a single provider),
    // automatically expand that section.
    if (modelsToRender.length === 1) {
      const onlyProvider = modelsToRender[0]?.provider;
      if (onlyProvider) {
        setAccordionValue([onlyProvider]);
        return;
      }
    }

    // Preserve previous behavior of initially expanding all sections when the
    // list first becomes available and the user hasn't interacted yet.
    if (accordionValue.length === 0) {
      setAccordionValue(modelsToRender.map((g) => g.provider));
    }
  }, [deferredOpen, modelsToRender, accordionValue.length]);

  useEffect(() => {
    if (!hotkeySignal || disabled) return;
    setOpen(true);
  }, [hotkeySignal, disabled]);

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
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {shortcutLabel && (
          <TooltipContent>
            {`${t('model_picker')} (${shortcutLabel})`}
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent
        className="flex h-[min(480px,85vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        align="start"
        sideOffset={4}
      >
        <TooltipProvider delayDuration={200}>
          {showUpgradeCta && (
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
          )}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="relative min-w-0 flex-1 sm:max-w-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder={t('model_selector_search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
                        setFavoritesOnly((v) => !v);
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

                {filteredProviderList.map((provider) => (
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
                          const next =
                            selectedProvider === provider ? null : provider;
                          setSelectedProvider(next);
                          if (next) setFavoritesOnly(false);
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
              <ScrollArea className="min-h-0 flex-1">
                {!deferredOpen || modelsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : modelsToRender.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    {t('model_selector_empty')}
                  </div>
                ) : (
                  <Command shouldFilter={false}>
                    <CommandList className="max-h-none border-0">
                      <Accordion
                        type="multiple"
                        value={accordionValue}
                        onValueChange={(val) =>
                          setAccordionValue(
                            Array.isArray(val) ? val : val ? [val] : []
                          )
                        }
                        className="w-full"
                      >
                        {modelsToRender.map(
                          ({ provider, models, isFavoritesGroup }) => (
                            <AccordionItem
                              key={provider}
                              value={provider}
                              className="border-b-0"
                            >
                              <AccordionTrigger
                                className="px-3 py-2 font-semibold text-muted-foreground text-xs hover:no-underline"
                                showChevron={true}
                              >
                                <div className="flex items-center gap-2">
                                  {!isFavoritesGroup && (
                                    <ProviderLogo
                                      provider={provider}
                                      size={14}
                                      className="shrink-0"
                                    />
                                  )}
                                  <span className="capitalize">
                                    {isFavoritesGroup
                                      ? t('model_favorites_heading')
                                      : formatProvider(provider)}
                                  </span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pt-0 pb-2">
                                <CommandGroup className="px-0 py-0 text-foreground **:[[cmdk-group-heading]]:hidden">
                                  {models.map((m) => {
                                    const allowed = isModelAllowed(m.value);
                                    const favorited = isFavorited(m.value);
                                    const item = (
                                      <CommandItem
                                        key={m.value}
                                        value={`${m.provider} ${m.label} ${m.value} ${m.description ?? ''}`}
                                        onSelect={() => {
                                          if (!allowed) return;
                                          onChange(m);
                                          setOpen(false);
                                        }}
                                        className={cn(
                                          'flex items-start gap-2 py-2',
                                          !allowed &&
                                            'cursor-not-allowed opacity-50'
                                        )}
                                        aria-disabled={!allowed}
                                      >
                                        <ProviderLogo
                                          provider={m.provider}
                                          size={18}
                                          className="mt-0.5 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-start justify-start gap-1.5">
                                            {allowed ? (
                                              <Check
                                                className={cn(
                                                  'h-3.5 w-3.5 shrink-0',
                                                  model.value === m.value
                                                    ? 'opacity-100'
                                                    : 'hidden'
                                                )}
                                              />
                                            ) : (
                                              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className="font-medium font-mono text-xs">
                                              {m.label}
                                            </span>
                                            <button
                                              type="button"
                                              className="group ml-auto flex shrink-0 rounded p-0.5 hover:bg-muted"
                                              onClick={(e) =>
                                                handleToggleFavorite(
                                                  e,
                                                  m.value,
                                                  m.label
                                                )
                                              }
                                              disabled={
                                                pendingModelId === m.value
                                              }
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
                                          {(m as any).tags?.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1 opacity-60">
                                              {(m as any).tags.map(
                                                (tag: string) => (
                                                  <span
                                                    key={tag}
                                                    className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[8px] uppercase leading-none"
                                                  >
                                                    {tag}
                                                  </span>
                                                )
                                              )}
                                            </div>
                                          )}
                                          {m.description && (
                                            <p className="mt-0.5 line-clamp-2 pr-4 text-[10px] text-muted-foreground">
                                              {m.description}
                                            </p>
                                          )}
                                        </div>
                                        {/* {(m.context ||
                                          (m as any).maxTokens ||
                                          (m as any).inputPricePerToken ||
                                          (m as any).outputPricePerToken) && (
                                          <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-[9px] text-muted-foreground/80 leading-tight">
                                            {m.context && (
                                              <span>
                                                {t('model_ctx_label')}:{' '}
                                                {m.context >= 1_000_000
                                                  ? `${(m.context / 1_000_000).toFixed(0)}M`
                                                  : `${(m.context / 1_000).toFixed(0)}K`}
                                              </span>
                                            )}
                                            {(m as any).maxTokens && (
                                              <span>
                                                {t('model_max_out_label')}:{' '}
                                                {(m as any).maxTokens >=
                                                1_000_000
                                                  ? `${((m as any).maxTokens / 1_000_000).toFixed(0)}M`
                                                  : `${((m as any).maxTokens / 1_000).toFixed(0)}K`}
                                              </span>
                                            )}
                                            {(m as any).inputPricePerToken && (
                                              <span>
                                                {t('model_in_price_label')}:{' '}
                                                {`$${(
                                                  ((m as any)
                                                    .inputPricePerToken as number) *
                                                    1_000_000
                                                ).toFixed(3)}/M`}
                                              </span>
                                            )}
                                            {(m as any).outputPricePerToken && (
                                              <span>
                                                {t('model_out_price_label')}:{' '}
                                                {`$${(
                                                  ((m as any)
                                                    .outputPricePerToken as number) *
                                                    1_000_000
                                                ).toFixed(3)}/M`}
                                              </span>
                                            )}
                                          </div>
                                        )} */}
                                      </CommandItem>
                                    );

                                    if (allowed) return item;

                                    return (
                                      <Tooltip key={m.value}>
                                        <TooltipTrigger asChild>
                                          {item}
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                          <p className="text-xs">
                                            {t('model_upgrade_required')}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                </CommandGroup>
                              </AccordionContent>
                            </AccordionItem>
                          )
                        )}
                      </Accordion>
                    </CommandList>
                  </Command>
                )}
              </ScrollArea>
            </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
