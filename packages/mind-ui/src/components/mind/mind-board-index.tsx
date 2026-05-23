'use client';

import { useTranslations } from 'next-intl';
import { BoardLibrary } from './board-library';
import { MindShell } from './mind-shell';
import { useMindBoardLibrary } from './use-mind-board-library';

type MindBoardIndexProps = {
  mindPrefix?: string;
  workspaceSlug: string;
  wsId: string;
};

export function MindBoardIndex({
  mindPrefix,
  workspaceSlug,
  wsId,
}: MindBoardIndexProps) {
  const t = useTranslations('mind');
  const library = useMindBoardLibrary({ mindPrefix, workspaceSlug, wsId });

  return (
    <MindShell
      className="px-3 pb-3 sm:px-4 md:px-6"
      style={{ paddingTop: 'clamp(9rem, 34dvh, 24rem)' }}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
        <header className="shrink-0">
          <h1 className="font-semibold text-foreground text-xl tracking-tight">
            {t('emptyState.title')}
          </h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm leading-5">
            {t('emptyState.description')}
          </p>
        </header>
        <BoardLibrary
          boards={library.boards}
          creating={library.creating}
          error={library.error}
          loading={library.loading}
          onCreateBoard={library.onCreateBoard}
          onRetry={library.onRetry}
          onSelectBoard={library.onSelectBoard}
        />
      </div>
    </MindShell>
  );
}
