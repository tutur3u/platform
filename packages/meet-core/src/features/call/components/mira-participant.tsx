'use client';
import { MessageSquare, Pin, Radio, ShieldCheck } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MiraAvatar } from './mira-profile';

export function MiraParticipant({
  sessionId,
  compact = false,
  className,
  focused,
  onFocus,
  onChat,
}: {
  sessionId: string;
  compact?: boolean;
  className?: string;
  focused: boolean;
  onFocus: () => void;
  onChat: () => void;
}) {
  const t = useTranslations('meet.live');
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const listener = (event: Event) => {
      const { message } = (event as CustomEvent).detail;
      if (message.sessionId !== sessionId) return;
      if (message.type === 'assistant.audio') {
        setSpeaking(true);
        clearTimeout(timer);
        timer = setTimeout(() => setSpeaking(false), 1200);
      } else if (
        message.type === 'assistant.interrupted' ||
        (message.type === 'assistant.live' && !message.active)
      ) {
        clearTimeout(timer);
        setSpeaking(false);
      }
    };
    window.addEventListener('meet:assistant-audio', listener);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('meet:assistant-audio', listener);
    };
  }, [sessionId]);
  return (
    <section
      aria-label={t('participant')}
      className={cn(
        'relative flex min-h-32 flex-col items-center justify-center overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-muted p-4',
        speaking && 'ring-2 ring-primary',
        className
      )}
    >
      {!compact && (
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="size-3" />
            {t('ai_participant')}
          </Badge>
        </div>
      )}
      <Button
        className="absolute top-2 right-2 size-8"
        size="icon"
        variant="ghost"
        aria-label={t('pin_mira')}
        aria-pressed={focused}
        onClick={onFocus}
      >
        <Pin className="size-4" />
      </Button>
      <div
        className={cn(
          'rounded-full border border-primary/20 bg-primary/5',
          compact ? 'p-2' : 'p-4',
          speaking && 'motion-safe:animate-pulse'
        )}
      >
        <MiraAvatar size={compact ? 28 : 48} />
      </div>
      <div
        className={cn(
          'flex items-center gap-2 font-semibold',
          compact ? 'mt-1 text-xs' : 'mt-2'
        )}
      >
        Mira <Radio className="size-3.5 text-primary" />
      </div>
      <p
        role="status"
        className={cn(
          'mt-1 text-muted-foreground text-xs',
          compact && 'sr-only'
        )}
      >
        {t(speaking ? 'speaking' : 'ready_for_you')}
      </p>
      {!compact && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={onChat}>
          <MessageSquare className="size-3.5" />
          {t('ask_in_chat')}
        </Button>
      )}
    </section>
  );
}
