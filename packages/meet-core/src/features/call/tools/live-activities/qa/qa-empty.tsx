'use client';

import { CircleCheck, EyeOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { LiveQaSort } from './qa-sort';

export type QaEmptyKind = 'none' | 'none_answered' | 'all_answered' | 'hidden';

/**
 * Why a tab has no questions to show. An empty Top or Newest list means
 * everything asked is answered, hidden by moderation, or nothing was asked.
 */
export function qaEmptyKind(
  sort: LiveQaSort,
  counts: { answered: number; hidden: number },
  { isHost, reviewing }: { isHost: boolean; reviewing: boolean }
): QaEmptyKind {
  if (sort === 'answered') return 'none_answered';
  if (counts.answered > 0) return 'all_answered';
  if (isHost && !reviewing && counts.hidden > 0) return 'hidden';
  return 'none';
}

export function QaEmpty({
  kind,
  hiddenCount,
}: {
  kind: QaEmptyKind;
  hiddenCount: number;
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  if (kind === 'all_answered' || kind === 'hidden') {
    const Icon = kind === 'hidden' ? EyeOff : CircleCheck;
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center"
      >
        <span
          aria-hidden
          className={
            kind === 'hidden'
              ? 'grid size-12 place-items-center rounded-full bg-muted text-muted-foreground'
              : 'grid size-12 place-items-center rounded-full bg-dynamic-green/15 text-dynamic-green'
          }
        >
          <Icon className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {kind === 'hidden'
              ? t('empty_hidden', { count: hiddenCount })
              : t('empty_all_answered')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t(
              kind === 'hidden'
                ? 'empty_hidden_hint'
                : 'empty_all_answered_hint'
            )}
          </p>
        </div>
      </div>
    );
  }
  return (
    <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
      {t(kind === 'none_answered' ? 'empty_answered' : 'empty')}
    </p>
  );
}
