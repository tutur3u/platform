'use client';

import { useTranslations } from 'next-intl';
import { BoardLibrary } from './board-library';
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
    <main className="relative -mx-2 -mb-2 flex h-[calc(100dvh-4.25rem)] min-h-0 w-[calc(100%+1rem)] flex-col overflow-hidden bg-background md:-m-4 md:h-dvh md:w-[calc(100%+2rem)]">
      <header className="shrink-0 px-6 pt-6 pb-2">
        <h1 className="font-semibold text-foreground text-lg tracking-tight">
          {t('emptyState.title')}
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          {t('emptyState.description')}
        </p>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-4">
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
    </main>
  );
}
