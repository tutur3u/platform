'use client';

import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@tuturuuu/utils/format';
import type { LiveQaClient, LiveQaSelf } from './qa-store';

/** What every card in one board shares. */
export type QaBoardContext = {
  meetingId: string;
  client: LiveQaClient;
  self: LiveQaSelf | null;
  isHost: boolean;
  canAnswer: boolean;
  onUploadError: (reason: 'too_large' | 'upload_failed') => void;
};

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  pinned: 'bg-dynamic-blue/10 text-dynamic-blue',
  answered: 'bg-dynamic-green/10 text-dynamic-green',
  voted: 'bg-primary/10 text-primary',
  hidden: 'bg-dynamic-orange/10 text-dynamic-orange',
} as const;

export function QaChip({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 font-medium text-xs',
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

export function QaLiveChip() {
  const t = useTranslations('meet.call.live_activities.qa');
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-dynamic-red/10 px-2 font-medium text-xs text-dynamic-red">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-dynamic-red motion-safe:animate-pulse"
      />
      {t('live')}
    </span>
  );
}

export function QaAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-muted font-semibold text-muted-foreground text-xs uppercase',
        className
      )}
    >
      {Array.from(name.trim())[0] ?? '?'}
    </span>
  );
}

export function QaTime({ iso }: { iso?: string }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={iso} className="text-muted-foreground">
      {format.relativeTime(date < now ? date : now, now)}
    </time>
  );
}

/** The name to show for a question or answer author. */
export function useQaAuthor(self: LiveQaSelf | null) {
  const t = useTranslations('meet.call.live_activities');
  return ({
    participantId,
    authorName,
    anonymous,
  }: {
    participantId: string;
    authorName?: string;
    anonymous?: boolean;
  }) => {
    if (participantId && participantId === self?.participantId) return t('you');
    if (anonymous && !authorName) return t('qa.anonymous_author');
    return authorName?.trim() || t('someone');
  };
}
