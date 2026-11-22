'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder } from '@tuturuuu/icons';
import { listWorkspaceStorageObjects } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { getStoragePathSegmentDisplayName } from './storage-display-name';

const PICKER_PAGE_SIZE = 100;

/** The subfolders of one folder in the Move destination picker. */
export function DriveMoveFolderList({
  onOpen,
  path,
  wsId,
}: {
  onOpen: (path: string) => void;
  path: string;
  wsId: string;
}) {
  const t = useTranslations('drive');
  const foldersQuery = useQuery({
    queryKey: ['drive-move-picker', wsId, path],
    queryFn: () =>
      listWorkspaceStorageObjects(
        wsId,
        {
          path: path || undefined,
          limit: PICKER_PAGE_SIZE,
          sortBy: 'name',
          sortOrder: 'asc',
        },
        { fetch }
      ),
    select: (payload) => payload.data.filter((entry) => !entry.id),
  });

  return (
    <div className="h-64 overflow-y-auto rounded-xl border border-border">
      {foldersQuery.isPending ? (
        <div className="space-y-2 p-2" role="status">
          <span className="sr-only">{t('states.loading')}</span>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className="h-10 rounded-lg" key={index} />
          ))}
        </div>
      ) : foldersQuery.isError ? (
        <div
          className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
          role="alert"
        >
          <p className="text-muted-foreground text-sm">
            {t('move.load_failed')}
          </p>
          <Button
            onClick={() => void foldersQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('states.retry')}
          </Button>
        </div>
      ) : foldersQuery.data.length === 0 ? (
        <p className="flex h-full items-center justify-center p-4 text-muted-foreground text-sm">
          {t('move.no_subfolders')}
        </p>
      ) : (
        <ul className="p-1">
          {foldersQuery.data.map((folder) => (
            <li key={folder.name}>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() =>
                  onOpen(path ? `${path}/${folder.name}` : (folder.name ?? ''))
                }
                type="button"
              >
                <Folder aria-hidden className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {getStoragePathSegmentDisplayName(folder.name ?? '')}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
