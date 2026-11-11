'use client';

import { Layers, Star } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { ProviderLogo } from '../provider-logo';
import { formatProvider } from './mira-model-selector-utils';

interface MiraModelSelectorSidebarProps {
  favoritesOnly: boolean;
  onToggleProvider: (provider: string) => void;
  onToggleShowAll: () => void;
  onToggleShowFavorites: () => void;
  providerNames: string[];
  selectedProvider: string | null;
}

export function MiraModelSelectorSidebar({
  favoritesOnly,
  onToggleProvider,
  onToggleShowAll,
  onToggleShowFavorites,
  providerNames,
  selectedProvider,
}: MiraModelSelectorSidebarProps) {
  const t = useTranslations('dashboard.mira_chat');

  return (
    <ScrollArea className="h-full min-h-0 shrink-0 border-r">
      <div className="flex flex-col gap-1 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('mx-1 h-8 w-8', favoritesOnly && 'bg-muted')}
              onClick={onToggleShowFavorites}
              aria-label={t('model_show_favorites')}
            >
              <Star
                className={cn('h-4 w-4', favoritesOnly && 'fill-current')}
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
              onClick={onToggleShowAll}
              aria-label={t('model_show_all')}
            >
              <Layers className="h-4 w-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="text-xs">{t('model_show_all') ?? 'All Models'}</p>
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
                onClick={() => onToggleProvider(provider)}
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
  );
}
