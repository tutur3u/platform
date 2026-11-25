'use client';

import { useQuery } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { getWorkspaceWhiteboard } from '@tuturuuu/internal-api/whiteboards';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  isExcalidrawSnapshot,
  parseStoredWhiteboardSnapshot,
} from '@tuturuuu/whiteboard';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { CustomWhiteboard } from './custom-whiteboard';
import { whiteboardKeys } from './whiteboard-types';

interface WhiteboardBoardViewProps {
  wsId: string;
  boardId: string;
}

/** Loads one board, then hands its title and first snapshot to the editor. */
export function WhiteboardBoardView({
  wsId,
  boardId,
}: WhiteboardBoardViewProps) {
  const t = useTranslations('common');
  // The editor owns later reads of the snapshot; this query only seeds it, so
  // a refetch must never swap the board under the user.
  const { data, error, isPending, isError, refetch } = useQuery({
    queryKey: whiteboardKeys.detail(wsId, boardId),
    queryFn: () => getWorkspaceWhiteboard(wsId, boardId),
    // Gone with the board page, so a reopened board is read again.
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const initialData = useMemo(() => {
    const parsed = parseStoredWhiteboardSnapshot(data?.snapshot);
    // Legacy TLDraw snapshots start fresh.
    return isExcalidrawSnapshot(parsed) ? parsed : undefined;
  }, [data?.snapshot]);

  if (isPending) {
    return (
      <div className="flex h-full min-h-64 w-full items-center justify-center">
        <LoadingIndicator className="h-10 w-10" />
      </div>
    );
  }

  if (isError && !(error instanceof InternalApiError && error.status === 404)) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground">{t('whiteboard_load_error')}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
        <h2 className="font-semibold text-lg">{t('whiteboard_not_found')}</h2>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t('whiteboard_not_found_description')}
        </p>
      </div>
    );
  }

  return (
    <CustomWhiteboard
      wsId={wsId}
      boardId={boardId}
      boardName={data.title}
      initialData={initialData}
    />
  );
}
