'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Bot, ClipboardList, MessageSquare, RefreshCw } from '@tuturuuu/icons';
import {
  type AiStudioCatalogResource,
  type AiStudioCatalogResponse,
  getAiStudioCatalog,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { InfiniteLoadTrigger } from './infinite-load-trigger';
import { RelativeTimestamp } from './relative-timestamp';
import { SectionCard } from './studio/section-card';
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeletonRows,
} from './studio/states';

export function CatalogPanel({
  resource,
  title,
  workspaceId,
}: {
  resource: AiStudioCatalogResource;
  title: string;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.catalog');
  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: AiStudioCatalogResponse) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getAiStudioCatalog(workspaceId, resource, {
        cursor: pageParam,
        limit: 50,
      }),
    queryKey: ['ai-studio-catalog', workspaceId, resource],
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const ResourceIcon =
    resource === 'agents'
      ? Bot
      : resource === 'datasets'
        ? ClipboardList
        : MessageSquare;

  return (
    <SectionCard
      actions={
        <Button
          aria-label={t('retry')}
          className="size-8"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={`size-3.5 ${query.isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      }
      description={t('loaded_count', { count: items.length })}
      flush
      footer={
        items.length ? (
          <InfiniteLoadTrigger
            endLabel={t('end_of_list')}
            errorLabel={t('error_description')}
            hasError={query.isFetchNextPageError}
            hasNextPage={Boolean(query.hasNextPage)}
            isFetchingNextPage={query.isFetchingNextPage}
            loadedLabel={t('loaded_count', { count: items.length })}
            loadingLabel={t('loading_more')}
            loadMoreLabel={t('load_more')}
            onLoadMore={() => void query.fetchNextPage()}
            retryLabel={t('retry')}
          />
        ) : null
      }
      icon={ResourceIcon}
      title={title}
    >
      <div className="p-4">
        {query.isPending ? (
          <StudioSkeletonRows count={5} label={t('loading')} />
        ) : query.isError && items.length === 0 ? (
          <StudioErrorState
            description={t('error_description')}
            onRetry={() => void query.refetch()}
            retryLabel={t('retry')}
            title={t('error_title')}
          />
        ) : items.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {items.map((item) => (
              <div
                className="flex min-w-0 items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-muted/30"
                key={item.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">
                    {item.name}
                  </div>
                  <div className="truncate text-muted-foreground text-xs">
                    {item.description || item.slug || item.id}
                  </div>
                  <div className="mt-1.5 text-muted-foreground text-xs">
                    {t('updated')} <RelativeTimestamp value={item.updatedAt} />
                  </div>
                </div>
                {item.version === null ? null : (
                  <Badge className="shrink-0" variant="outline">
                    v{item.version}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <StudioEmptyState icon={ResourceIcon} title={t('empty')} />
        )}
      </div>
    </SectionCard>
  );
}
