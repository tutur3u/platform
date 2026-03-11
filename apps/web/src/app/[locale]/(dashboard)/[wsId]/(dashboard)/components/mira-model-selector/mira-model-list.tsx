'use client';

import { Loader2 } from '@tuturuuu/icons';
import { CommandGroup } from '@tuturuuu/ui/command';
import { cn } from '@tuturuuu/utils/format';
import { MiraModelListItem } from './mira-model-list-item';
import type { MiraModelListProps } from './types';

export function MiraModelList({
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
}: MiraModelListProps) {
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
