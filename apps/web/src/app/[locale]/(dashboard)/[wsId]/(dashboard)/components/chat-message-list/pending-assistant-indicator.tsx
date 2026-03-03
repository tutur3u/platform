'use client';

import { Loader2, Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getPendingAssistantStatus } from './pending-assistant-status';
import type { ChatMessageListProps } from './types';

function formatElapsedTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function PendingAssistantIndicator({
  assistantName,
  messageAttachments,
  messages,
}: Pick<
  ChatMessageListProps,
  'assistantName' | 'messageAttachments' | 'messages'
>) {
  const t = useTranslations('dashboard.mira_chat');
  const status = getPendingAssistantStatus({
    messageAttachments,
    messages,
    t: (key, values) => t(key as never, values as never),
  });
  const statusKey = [
    status.kind,
    status.title,
    status.detail,
    status.badge ?? '',
  ].join('|');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    void statusKey;
    setStartedAt(Date.now());
    setElapsedSeconds(0);
  }, [statusKey]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  return (
    <div className="mt-3 flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/12 text-dynamic-purple shadow-dynamic-purple/10 shadow-sm ring-1 ring-dynamic-purple/10">
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-col items-start">
        <span className="mb-1 px-1 font-medium text-[11px] text-muted-foreground">
          {assistantName ?? 'Mira'}
        </span>

        <div className="max-w-[min(100%,26rem)] rounded-[20px] border border-border/60 bg-background/95 px-3.5 py-3 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-dynamic-purple/90" />
              <span className="h-1.5 w-5 animate-pulse rounded-full bg-dynamic-purple/35 [animation-delay:120ms]" />
              <span className="h-1.5 w-3 animate-pulse rounded-full bg-dynamic-purple/20 [animation-delay:240ms]" />
            </div>
            <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {formatElapsedTime(elapsedSeconds)}
            </div>
          </div>

          <div className="mt-2.5 flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground text-sm">
                {status.title}
              </p>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {status.detail}
              </p>
            </div>

            {status.badge ? (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 font-medium text-[10px] uppercase tracking-[0.16em]',
                  status.kind === 'attachment'
                    ? 'bg-dynamic-purple/10 text-dynamic-purple'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {status.badge}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
