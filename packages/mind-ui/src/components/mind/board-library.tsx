'use client';

import { CircleAlert, Loader2, Plus, RefreshCw, X } from '@tuturuuu/icons';
import type { MindBoardSummary } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { BoardSearchPopover } from './board-search-popover';
import { CreateBoardDialog } from './create-board-dialog';

type Props = {
  boards: MindBoardSummary[];
  creating?: boolean;
  error?: boolean;
  loading?: boolean;
  onClose?: () => void;
  onCreateBoard: (title: string) => void;
  onRetry?: () => void;
  onSelectBoard: (boardId: string) => void;
  selectedBoardId?: string | null;
};

export function BoardLibrary({
  boards,
  creating,
  error,
  loading,
  onClose,
  onCreateBoard,
  onRetry,
  onSelectBoard,
  selectedBoardId,
}: Props) {
  const t = useTranslations('mind');
  const [query, setQuery] = useState('');
  const filteredBoards = useMemo(
    () =>
      boards.filter((board) =>
        board.title.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [boards, query]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 rounded-md border border-border/70 bg-card/50 p-1.5">
          <CreateBoardDialog
            creating={creating}
            onCreateBoard={onCreateBoard}
            trigger={
              <Button
                aria-label={t('actions.createBoard')}
                className="h-8 min-w-0 flex-1 justify-center gap-2 rounded-sm px-2"
                size="sm"
                type="button"
              >
                <Plus className="h-4 w-4" />
                <span className="truncate">{t('actions.createBoard')}</span>
              </Button>
            }
          />
          <BoardSearchPopover query={query} onQueryChange={setQuery} />
          {onClose ? (
            <Button
              aria-label={t('actions.closeBoards')}
              className="h-8 w-8"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {query ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-muted-foreground text-xs">
            <span className="min-w-0 truncate">{query}</span>
            <Button
              className="h-6 rounded-sm px-2"
              onClick={() => setQuery('')}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('actions.clearSearch')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-border/80 border-dashed px-3 py-2.5 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('loadingBoards')}</span>
            </div>
          ) : error ? (
            <div className="space-y-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/5 px-3 py-2.5 text-sm">
              <div className="flex items-start gap-2 text-dynamic-red">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t('boardLoadError')}</p>
              </div>
              {onRetry ? (
                <Button
                  className="h-7 gap-2 rounded-sm"
                  onClick={onRetry}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('actions.retry')}
                </Button>
              ) : null}
            </div>
          ) : (
            filteredBoards.map((board) => (
              <button
                className={cn(
                  'group w-full rounded-md border px-3 py-2 text-left transition hover:border-foreground/20 hover:bg-muted/60',
                  selectedBoardId === board.id
                    ? 'border-primary/70 bg-primary/10'
                    : 'border-border/70 bg-card/40'
                )}
                key={board.id}
                onClick={() => {
                  onSelectBoard(board.id);
                  onClose?.();
                }}
                type="button"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-medium text-sm leading-5">
                    {board.title}
                  </h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded-sm border border-border/60 px-1.5 py-0.5">
                    {t(`horizons.${board.defaultHorizon}`)}
                  </span>
                </div>
              </button>
            ))
          )}
          {!loading && !error && !filteredBoards.length ? (
            <div className="rounded-md border border-border/80 border-dashed px-3 py-2.5 text-muted-foreground text-sm">
              {boards.length ? t('emptyBoardsSearch') : t('emptyBoards')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
