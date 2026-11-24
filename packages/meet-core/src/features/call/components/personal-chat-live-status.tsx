'use client';
import { Mic, Pause, Square } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { LiveSessionSnapshot } from '../../live-assistant/live-session-store';

const STATES = ['connecting', 'listening', 'paused', 'recovering'] as const;

/** One inline row while Mira is live: Listening, Pause, Stop. */
export function PersonalChatLiveStatus({
  session,
}: {
  session: LiveSessionSnapshot;
}) {
  const t = useTranslations('meet.live');
  const ta = useTranslations('meet.call.miraEverywhere.tutor.assistant');
  const paused = session.status === 'paused';
  const state = STATES.find((name) => name === session.status) ?? 'connecting';
  // The meeting microphone being on already keeps private capture paused.
  const pauseLocked =
    session.audioSuppressed ||
    (session.mode === 'personal' && session.meetingMicOn);
  return (
    <div
      role="status"
      className="flex items-center gap-2 ps-2 text-muted-foreground text-xs"
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full motion-reduce:animate-none',
          state === 'listening'
            ? 'bg-dynamic-green motion-safe:animate-pulse'
            : 'bg-muted-foreground/60'
        )}
      />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {t(`state_${state}`)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
        aria-label={t(paused ? 'resume' : 'pause')}
        disabled={pauseLocked}
        onClick={() =>
          session.controls.send({ type: 'pause', paused: !paused })
        }
      >
        {paused ? (
          <Mic aria-hidden className="size-3.5" />
        ) : (
          <Pause aria-hidden className="size-3.5" />
        )}
        {ta(paused ? 'resume' : 'pause')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-full px-2.5 text-destructive text-xs hover:text-destructive"
        aria-label={t('stop')}
        onClick={() => void session.controls.stop()}
      >
        <Square aria-hidden className="size-3.5" />
        {ta('stop')}
      </Button>
    </div>
  );
}
