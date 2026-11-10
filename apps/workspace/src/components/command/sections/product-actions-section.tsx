'use client';

import { ArrowRight, ExternalLink, Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  buildCommandActions,
  type CommandAction,
  type CommandActionLabels,
} from '../utils/command-actions';
import { addRecentPage } from '../utils/recent-items';
import { searchItems } from '../utils/search-scoring';
import type { FlatNavItem } from '../utils/use-navigation-data';

interface ProductActionsSectionProps {
  navItems: FlatNavItem[];
  query: string;
  onOpenAction: (action: CommandAction) => void;
  onSelect?: () => void;
}

export function ProductActionsSection({
  navItems,
  query,
  onOpenAction,
  onSelect,
}: ProductActionsSectionProps) {
  const router = useRouter();
  const t = useTranslations('command_palette');

  const labels = React.useMemo<CommandActionLabels>(
    () => ({
      createInProduct: (product) => t('create_in_product', { product }),
      createInProductDescription: (product) =>
        t('create_in_product_description', { product }),
      manageProduct: (product) => t('manage_product', { product }),
      manageProductDescription: (product) =>
        t('manage_product_description', { product }),
      openExternalItem: (item) => t('open_external_item', { item }),
      openExternalItemDescription: (item) =>
        t('open_external_item_description', { item }),
      openItem: (item) => t('open_item', { item }),
      openItemDescription: (item) => t('open_item_description', { item }),
    }),
    [t]
  );

  const actions = React.useMemo(
    () => buildCommandActions(navItems, labels),
    [navItems, labels]
  );

  const results = React.useMemo(() => {
    return searchItems(actions, query, {
      limit: query.trim() ? 14 : 8,
      minScore: query.trim() ? 100 : 0,
      getBoost: (action) => action.priority,
    });
  }, [actions, query]);

  if (!results.length) return null;

  const handleSelect = (action: CommandAction) => {
    if (action.kind === 'panel') {
      onOpenAction(action);
      return;
    }

    addRecentPage(action.targetHref, action.title);

    if (action.kind === 'external') {
      if (action.newTab) {
        window.open(action.targetHref, '_blank', 'noopener,noreferrer');
      } else {
        window.location.assign(action.targetHref);
      }
      onSelect?.();
      return;
    }

    router.push(action.targetHref);
    onSelect?.();
  };

  return (
    <CommandGroup heading={t('smart_actions')}>
      {results.map(({ item: action }) => (
        <CommandItem
          key={action.id}
          value={`action-${action.id}-${action.title}-${action.aliases.join(' ')}`}
          onSelect={() => handleSelect(action)}
          className="flex items-center gap-3"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            {action.icon ?? (
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{action.title}</span>
              {action.kind === 'panel' && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {t('inline')}
                </Badge>
              )}
            </div>
            <span className="truncate text-muted-foreground text-xs">
              {action.description}
            </span>
          </div>

          {action.kind === 'external' ? (
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
