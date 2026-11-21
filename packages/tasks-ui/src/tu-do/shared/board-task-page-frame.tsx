'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface BoardTaskPaging {
  hasMore: boolean;
  pending: boolean;
  failed: boolean;
  loadMore: () => void;
}

export function BoardTaskPageFrame({
  children,
  paging,
}: {
  children: ReactNode;
  paging: BoardTaskPaging | null;
}) {
  const t = useTranslations('common');
  if (!paging) return children;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <div
        className="flex shrink-0 justify-center px-2 py-1"
        aria-live="polite"
      >
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={paging.pending}
          aria-busy={paging.pending}
          onClick={paging.loadMore}
        >
          {t(
            paging.pending
              ? 'loading_more_tasks'
              : paging.failed
                ? 'retry'
                : 'load_more'
          )}
        </Button>
      </div>
    </div>
  );
}
