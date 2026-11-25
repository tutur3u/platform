'use client';

import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@tuturuuu/icons';
import { listWorkspaceWhiteboards } from '@tuturuuu/internal-api/whiteboards';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import CreateWhiteboardDialog from './create-whiteboard-dialog';
import WhiteboardsList from './whiteboards-list';
import { toWhiteboard, whiteboardKeys } from './whiteboard-types';

export function WhiteboardsPageView({ wsId }: { wsId: string }) {
  const t = useTranslations('common');
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: whiteboardKeys.list(wsId),
    queryFn: () => listWorkspaceWhiteboards(wsId),
  });

  const unknownLabel = t('unknown');
  const whiteboards = useMemo(
    () =>
      (data ?? []).map((summary) => toWhiteboard(wsId, summary, unknownLabel)),
    [data, unknownLabel, wsId]
  );

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <h1 className="font-bold text-3xl tracking-tight">
            {t('whiteboards')}
          </h1>
          <p className="text-muted-foreground">
            {t('whiteboards_description')}
          </p>
        </div>
        <CreateWhiteboardDialog
          wsId={wsId}
          trigger={
            <Button className="gap-2">
              <PlusIcon className="h-4 w-4" />
              {t('new_whiteboard')}
            </Button>
          }
        />
      </div>

      <Separator />

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <LoadingIndicator className="h-8 w-8" />
        </div>
      ) : isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-muted-foreground">{t('whiteboards_load_error')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <WhiteboardsList wsId={wsId} whiteboards={whiteboards} />
      )}
    </div>
  );
}
