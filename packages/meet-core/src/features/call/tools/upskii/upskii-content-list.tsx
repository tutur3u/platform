'use client';

import type { UpskiiContentItem } from '@tuturuuu/internal-api/upskii-content';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ActivityStateView } from '../../stage-layout/activity-shell';
import type { UpskiiListState } from './upskii-list-state';

/**
 * One Upskii list with its loading, refusal, empty and error states. Each row
 * is one button, so a row reads and acts the same with a mouse, a keyboard or
 * a touch screen.
 */
export function UpskiiContentList({
  state,
  emptyTitle,
  onRetry,
  onLoadMore,
  renderAction,
  onSelect,
}: {
  state: UpskiiListState;
  emptyTitle: string;
  onRetry: () => void;
  onLoadMore: () => void;
  /** The trailing label of a row, such as Present. */
  renderAction?: (item: UpskiiContentItem) => ReactNode;
  onSelect: (item: UpskiiContentItem) => void;
}) {
  const t = useTranslations('meet.call.upskii');
  switch (state.kind) {
    case 'loading':
      return (
        <ActivityStateView state={{ kind: 'loading' }} title={t('title')} />
      );
    case 'unlinked':
      return (
        <ActivityStateView
          state={{
            kind: 'empty',
            title: t('unlinked_title'),
            description: t('unlinked_description'),
          }}
        />
      );
    case 'early_access':
      return (
        <ActivityStateView
          state={{ kind: 'empty', title: t('early_access_title') }}
        />
      );
    case 'scope':
      return (
        <ActivityStateView
          state={{
            kind: 'empty',
            title: t('scope_title'),
            description: t('unlinked_description'),
          }}
        />
      );
    case 'error':
      return (
        <ActivityStateView
          state={{
            kind: 'error',
            title: t('error_title'),
            onRetry,
            retrying: state.retrying,
          }}
        />
      );
    case 'empty':
      return <ActivityStateView state={{ kind: 'empty', title: emptyTitle }} />;
    case 'ready':
      return (
        <div className="flex flex-col gap-1">
          <ul className="flex flex-col gap-1">
            {state.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.title}
                  </span>
                  {renderAction?.(item)}
                </button>
              </li>
            ))}
          </ul>
          {state.hasMore && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={onLoadMore}
              disabled={state.loadingMore}
              aria-busy={state.loadingMore || undefined}
            >
              {t('load_more')}
            </Button>
          )}
        </div>
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}
