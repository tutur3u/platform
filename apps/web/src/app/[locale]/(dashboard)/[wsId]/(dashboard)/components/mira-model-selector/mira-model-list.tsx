'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { CommandGroup } from '@tuturuuu/ui/command';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { MiraModelListItem } from './mira-model-list-item';
import type { MiraModelListProps } from './types';

export function MiraModelList({
  defaultModelId,
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
}: MiraModelListProps) {
  const t = useTranslations('dashboard.mira_chat');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !onLoadMore ||
      !hasNextPage ||
      isFetchingNextPage ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { root: target.closest('[cmdk-list]'), rootMargin: '100px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <div className="w-full min-w-0">
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
          models.map((itemModel) => (
            <MiraModelListItem
              key={itemModel.value}
              defaultModelId={defaultModelId}
              isFavorited={isFavorited}
              isModelAllowed={isModelAllowed}
              model={itemModel}
              onSelectModel={onSelectModel}
              onToggleFavorite={onToggleFavorite}
              pendingModelId={pendingModelId}
              selectedModelId={model.value}
            />
          ))
        )}
      </CommandGroup>

      {hasNextPage && onLoadMore && (
        <div ref={loadMoreRef} className="py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage && (
              <Loader2 aria-hidden className="size-3 animate-spin" />
            )}
            {t('model_selector_load_more')}
          </Button>
        </div>
      )}
    </div>
  );
}
