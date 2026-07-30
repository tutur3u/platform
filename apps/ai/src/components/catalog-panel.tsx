'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from '@tuturuuu/icons';
import {
  type AiStudioCatalogResource,
  type AiStudioCatalogResponse,
  getAiStudioCatalog,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { RelativeTimestamp } from './relative-timestamp';

export function CatalogPanel({
  resource,
  workspaceId,
}: {
  resource: AiStudioCatalogResource;
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

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {query.isPending ? (
          <LoadingState label={t('loading')} />
        ) : query.isError ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
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
        ) : items.length ? (
          <>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  className="flex min-w-0 items-center gap-3 rounded-xl border p-3"
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
            {query.hasNextPage ? (
              <div className="flex justify-center border-t pt-3">
                <Button
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                  variant="outline"
                >
                  {query.isFetchingNextPage
                    ? t('loading_more')
                    : t('load_more')}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid min-h-36 place-items-center rounded-xl border border-dashed text-muted-foreground text-sm">
            {t('empty')}
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
