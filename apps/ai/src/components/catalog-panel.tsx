'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Bot,
  ClipboardList,
  MessageSquare,
  RefreshCw,
} from '@tuturuuu/icons';
import {
  type AiStudioCatalogResource,
  type AiStudioCatalogResponse,
  getAiStudioCatalog,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { InfiniteLoadTrigger } from './infinite-load-trigger';
import { RelativeTimestamp } from './relative-timestamp';

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
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-muted/15">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl border bg-background p-2.5 shadow-sm">
            <ResourceIcon className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {t('loaded_count', { count: items.length })}
            </p>
          </div>
        </div>
        <Button
          aria-label={t('retry')}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <div className="p-4">
            <LoadingState label={t('loading')} />
          </div>
        ) : query.isError && items.length === 0 ? (
          <div className="p-4">
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
              <AlertCircle className="size-5 text-dynamic-red" />
              <div>
                <p className="font-medium">{t('error_title')}</p>
                <p className="text-muted-foreground text-sm">
                  {t('error_description')}
                </p>
              </div>
              <Button
                onClick={() => void query.refetch()}
                size="sm"
                variant="outline"
              >
                <RefreshCw className="mr-2 size-4" />
                {t('retry')}
              </Button>
            </div>
          </div>
        ) : items.length ? (
          <>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {items.map((item) => (
                <div
                  className="group flex min-w-0 items-center gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-muted/20"
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="truncate text-muted-foreground text-sm">
                      {item.description || item.slug || item.id}
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {t('updated')}{' '}
                      <RelativeTimestamp value={item.updatedAt} />
                    </div>
                  </div>
                  {item.version !== null ? (
                    <Badge variant="outline">v{item.version}</Badge>
                  ) : null}
                </div>
              ))}
            </div>
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
          </>
        ) : (
          <div className="p-4">
            <div className="grid min-h-44 place-items-center rounded-xl border border-dashed bg-muted/10 px-6 text-center text-muted-foreground text-sm">
              {t('empty')}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div aria-label={label} className="space-y-2" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          className="h-[4.125rem] animate-pulse rounded-xl bg-foreground/5"
          key={index}
        />
      ))}
    </div>
  );
}
