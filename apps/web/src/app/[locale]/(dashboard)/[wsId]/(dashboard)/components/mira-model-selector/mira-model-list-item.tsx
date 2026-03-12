'use client';

import { Check, Lock, Star } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { CommandItem } from '@tuturuuu/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { ProviderLogo } from '../provider-logo';
import type {
  ModelAllowedFn,
  ModelFavoritedFn,
  ModelFavoriteToggleHandler,
} from './types';

interface MiraModelListItemProps {
  defaultModelId: string | null;
  isFavorited: ModelFavoritedFn;
  isModelAllowed: ModelAllowedFn;
  model: AIModelUI;
  onSelectModel: (model: AIModelUI) => void;
  onToggleFavorite: ModelFavoriteToggleHandler;
  pendingModelId: string | null;
  selectedModelId: string;
}

export function MiraModelListItem({
  defaultModelId,
  isFavorited,
  isModelAllowed,
  model,
  onSelectModel,
  onToggleFavorite,
  pendingModelId,
  selectedModelId,
}: MiraModelListItemProps) {
  const t = useTranslations('dashboard.mira_chat');
  const allowed = isModelAllowed(model);
  const favorited = isFavorited(model.value);
  const isPlanDefault = model.value === defaultModelId;

  const item = (
    <CommandItem
      value={`${model.provider} ${model.label} ${model.value} ${model.description ?? ''}`}
      onSelect={() => {
        if (!allowed) return;
        onSelectModel(model);
      }}
      className={cn(
        'flex items-start gap-2 py-2',
        !allowed && 'cursor-not-allowed opacity-50'
      )}
      aria-disabled={!allowed}
    >
      <ProviderLogo
        provider={model.provider}
        size={18}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-start gap-1.5">
          {allowed ? (
            <Check
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                selectedModelId === model.value ? 'opacity-100' : 'hidden'
              )}
            />
          ) : (
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium font-mono text-xs">{model.label}</span>
          {isPlanDefault ? (
            <span className="rounded-full border border-dynamic-primary/25 bg-dynamic-primary/10 px-1.5 py-0.5 font-sans text-[8px] text-dynamic-primary uppercase tracking-[0.16em]">
              {t('model_default_badge')}
            </span>
          ) : null}
          <button
            type="button"
            className="group ml-auto flex shrink-0 rounded p-0.5 hover:bg-muted"
            onClick={(event) =>
              onToggleFavorite(event, model.value, model.label)
            }
            disabled={pendingModelId === model.value}
            aria-label={favorited ? t('model_unfavorite') : t('model_favorite')}
            title={favorited ? t('model_unfavorite') : t('model_favorite')}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5 transition-[fill]',
                favorited && 'fill-current',
                !favorited && 'fill-transparent group-hover:fill-current'
              )}
            />
          </button>
        </div>
        {model.tags?.length ? (
          <div className="flex flex-wrap items-center gap-1 opacity-60">
            {model.tags.map((tag) => (
              <span
                key={tag}
                className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[8px] uppercase leading-none"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {model.description ? (
          <p className="mt-0.5 line-clamp-2 pr-4 text-[10px] text-muted-foreground">
            {model.description}
          </p>
        ) : null}
      </div>
    </CommandItem>
  );

  if (allowed) return item;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right">
        <p className="text-xs">{t('model_upgrade_required')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
