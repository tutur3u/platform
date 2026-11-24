'use client';

import { MessageSquare, Pin } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ComponentProps, useEffect, useState } from 'react';
import { MiraAvatar } from './mira-profile';
import { MiraWhereStrip } from './mira-where-strip';

export type MiraParticipantState = 'listening' | 'speaking' | 'chat';

const waveHeights = {
  listening: ['h-1', 'h-2', 'h-1.5'],
  speaking: ['h-1.5', 'h-4', 'h-2.5', 'h-3.5', 'h-2'],
};

export function MiraParticipant({
  sessionId,
  compact = false,
  className,
  focused,
  state,
  caption,
  where,
  onFocus,
  onChat,
}: {
  sessionId?: string;
  compact?: boolean;
  className?: string;
  focused: boolean;
  state?: MiraParticipantState;
  caption?: string;
  where?: ComponentProps<typeof MiraWhereStrip>;
  onFocus?: () => void;
  onChat: () => void;
}) {
  const t = useTranslations('meet.live');
  const [speakingSession, setSpeakingSession] = useState<string>();
  useEffect(() => {
    if (!sessionId) return;
    let timer: ReturnType<typeof setTimeout>;
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const message: unknown = event.detail?.message;
      if (
        !message ||
        typeof message !== 'object' ||
        !('sessionId' in message) ||
        message.sessionId !== sessionId ||
        !('type' in message)
      )
        return;
      if (message.type === 'assistant.audio') {
        setSpeakingSession(sessionId);
        clearTimeout(timer);
        timer = setTimeout(() => setSpeakingSession(undefined), 1200);
      } else if (
        message.type === 'assistant.interrupted' ||
        (message.type === 'assistant.live' &&
          'active' in message &&
          message.active === false)
      ) {
        clearTimeout(timer);
        setSpeakingSession(undefined);
      }
    };
    window.addEventListener('meet:assistant-audio', listener);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('meet:assistant-audio', listener);
    };
  }, [sessionId]);

  const mode =
    state ??
    (speakingSession && speakingSession === sessionId
      ? 'speaking'
      : 'listening');
  return (
    <section
      aria-label={t('participant')}
      className={cn(
        'flex min-w-0 flex-col gap-2',
        compact && 'gap-0',
        className
      )}
    >
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-2xl border border-dynamic-purple/35 bg-gradient-to-br from-dynamic-purple/15 via-background to-muted',
          compact ? 'gap-1 p-1.5' : 'gap-1.5 p-2',
          mode === 'speaking' && 'ring-1 ring-dynamic-purple'
        )}
      >
        <div className="flex flex-wrap justify-center gap-1 pe-7">
          <Badge
            className="gap-1 rounded-full bg-dynamic-purple text-background"
            variant="secondary"
          >
            <MiraAvatar size={14} />
            {t(mode === 'chat' ? 'tile_chat' : 'tile_live')}
          </Badge>
          <Badge
            role="status"
            variant="outline"
            className={cn(
              'gap-1 rounded-full border-dynamic-purple/25 bg-calendar-bg-purple text-dynamic-purple',
              compact && 'sr-only'
            )}
          >
            {mode === 'chat' ? (
              <MessageSquare aria-hidden className="size-3" />
            ) : (
              <span aria-hidden className="flex h-4 items-center gap-0.5">
                {waveHeights[mode].map((height, index) => (
                  <span
                    key={height}
                    className={cn(
                      'w-0.5 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none',
                      height,
                      mode === 'listening'
                        ? '[animation-duration:2.2s]'
                        : '[animation-duration:.9s]'
                    )}
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                ))}
              </span>
            )}
            {t(`tile_${mode}_status`)}
          </Badge>
        </div>
        {onFocus && (
          <Button
            className="absolute end-1.5 top-1.5 size-7 motion-reduce:transition-none"
            size="icon"
            variant="ghost"
            aria-label={t('pin_mira')}
            aria-pressed={focused}
            onClick={onFocus}
          >
            <Pin aria-hidden className="size-4" />
          </Button>
        )}
        {!compact && (
          <div className="relative mx-auto my-auto grid shrink-0 place-items-center rounded-2xl border border-dynamic-purple/40 bg-dynamic-purple/10 p-1.5 ring-2 ring-dynamic-purple/20">
            {mode === 'speaking' && (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1.5 rounded-2xl border border-dynamic-purple/65 motion-safe:animate-ping motion-reduce:animate-none"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-3 rounded-2xl border border-dynamic-purple/35 motion-safe:animate-ping motion-reduce:animate-none [animation-delay:450ms]"
                />
              </>
            )}
            <MiraAvatar size={focused ? 72 : 36} />
          </div>
        )}
        {!compact && (caption || (focused && mode === 'listening')) && (
          <p className="mx-auto line-clamp-2 w-full max-w-lg rounded-xl border bg-card/95 px-3 py-2 text-center text-sm shadow-sm">
            {caption ? (
              <>
                <strong className="text-dynamic-purple">
                  {t('tile_caption_speaker')}
                </strong>{' '}
                <span className="wrap-break-word">{caption}</span>
              </>
            ) : (
              t('tile_listening_hint')
            )}
          </p>
        )}
        <div className="flex min-w-0 items-center justify-between gap-1.5">
          <span className="truncate font-semibold text-dynamic-purple text-xs">
            {t('tile_footer')}
          </span>
          {!compact && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 motion-reduce:transition-none"
              onClick={onChat}
            >
              <MessageSquare aria-hidden className="size-3.5" />
              {t('tile_open_chat')}
            </Button>
          )}
        </div>
      </div>
      {!compact && (focused || where) && <MiraWhereStrip {...where} />}
    </section>
  );
}
