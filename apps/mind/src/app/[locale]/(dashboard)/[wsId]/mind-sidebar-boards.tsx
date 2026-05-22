'use client';

import { BoardLibrary, useMindBoardLibrary } from '@tuturuuu/mind-ui';
import { useTranslations } from 'next-intl';

export function MindSidebarBoards({
  mindPrefix,
  onClose,
  wsId,
  workspaceSlug,
}: {
  mindPrefix?: string;
  onClose?: () => void;
  wsId: string;
  workspaceSlug: string;
}) {
  const t = useTranslations('mind');
  const library = useMindBoardLibrary({ mindPrefix, workspaceSlug, wsId });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
      <div className="px-2 pt-2">
        <p className="font-medium text-foreground text-sm">
          {t('emptyState.title')}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('emptyState.description')}
        </p>
      </div>
      <BoardLibrary
        boards={library.boards}
        creating={library.creating}
        error={library.error}
        loading={library.loading}
        onClose={onClose}
        onCreateBoard={library.onCreateBoard}
        onRetry={library.onRetry}
        onSelectBoard={library.onSelectBoard}
      />
    </div>
  );
}
