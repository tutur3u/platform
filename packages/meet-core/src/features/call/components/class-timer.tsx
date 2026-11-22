'use client';

import { useMutation } from '@tanstack/react-query';
import { Clock3 } from '@tuturuuu/icons';
import { commandMeetClassTimer } from '@tuturuuu/internal-api/meet-call';
import {
  CLASS_TIMER_PRESETS_MS,
  formatClassTimer,
} from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { CallState } from '../lib/call-state';

type TimerAction = 'start' | 'pause' | 'resume' | 'stop';
type Timer = CallState['classTimer'];

function useSyncedClock(serverNow: string | null, running: boolean) {
  const skew = useRef(0);
  const seen = useRef<string | null>(null);
  if (serverNow !== seen.current) {
    seen.current = serverNow;
    skew.current = serverNow ? Date.parse(serverNow) - Date.now() : 0;
  }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now + skew.current;
}

/** Remaining time on the room's clock; null without a timer. */
function useRemaining(timer: Timer, serverNow: string | null) {
  const clock = useSyncedClock(serverNow, timer?.status === 'running');
  const remaining = !timer
    ? null
    : timer.status === 'paused'
      ? timer.remainingMs
      : timer.status === 'ended' || !timer.endsAt
        ? 0
        : Math.max(0, Date.parse(timer.endsAt) - clock);
  return { remaining, ended: timer?.status === 'ended' || remaining === 0 };
}

/** Whether this person may start the room timer. */
export function canStartClassTimer(state: CallState) {
  return (
    state.classTimerEnabled &&
    (state.classRole === 'host' || state.classRole === 'cohost')
  );
}

/**
 * The read-only timer chip everyone sees while the room has a timer. Hosts
 * set and change it from Activities. The ticking time is not announced; with
 * `announce`, one polite live region reports only state changes (started,
 * paused, Time's up).
 */
export function ClassTimerChip({
  timer,
  serverNow,
  announce = false,
}: {
  timer: NonNullable<Timer>;
  serverNow: string | null;
  announce?: boolean;
}) {
  const t = useTranslations('meet.call');
  const { remaining, ended } = useRemaining(timer, serverNow);
  const label = ended
    ? t('class_timer_ended')
    : t('class_timer_remaining', { time: formatClassTimer(remaining ?? 0) });
  const status = ended
    ? t('class_timer_ended')
    : timer.status === 'paused'
      ? t('class_timer_paused')
      : t('class_timer_started');
  return (
    <>
      <span
        className={cn(
          'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 font-medium text-sm tabular-nums',
          ended &&
            'motion-safe:animate-pulse bg-dynamic-orange/15 text-dynamic-orange'
        )}
        data-slot="class-timer-chip"
        title={label}
      >
        <Clock3 className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t('class_timer')}: </span>
        <span className="truncate">
          {ended ? label : formatClassTimer(remaining ?? 0)}
        </span>
      </span>
      {announce && (
        <span aria-live="polite" className="sr-only" role="status">
          {status}
        </span>
      )}
    </>
  );
}

/**
 * Timer controls for hosts and co-hosts: presets, a custom length, and for
 * the host pause, resume and stop. Rendered on the Activities Timer page.
 */
export function ClassTimerControls({
  meetingId,
  state,
}: {
  meetingId: string;
  state: CallState;
}) {
  const t = useTranslations('meet.call');
  const minutesId = useId();
  const [custom, setCustom] = useState('15');
  const timer = state.classTimer;
  const canControl = state.classRole === 'host';
  const command = useMutation({
    mutationFn: (input: { action: TimerAction; durationMs?: number }) =>
      commandMeetClassTimer(meetingId, input),
  });
  const send = (action: TimerAction, durationMs?: number) =>
    command.mutate({ action, durationMs });
  const customMinutes = Number(custom);
  const customValid =
    Number.isInteger(customMinutes) &&
    customMinutes >= 1 &&
    customMinutes <= 180;
  return (
    <div className="grid gap-4">
      {timer && (
        <ClassTimerChip timer={timer} serverNow={state.classTimerServerNow} />
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CLASS_TIMER_PRESETS_MS.map((durationMs) => (
          <Button
            key={durationMs}
            onClick={() => send('start', durationMs)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('class_timer_preset', { minutes: durationMs / 60_000 })}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (customValid) send('start', customMinutes * 60_000);
        }}
      >
        <div className="grid min-w-0 flex-1 gap-1.5">
          <label className="font-medium text-sm" htmlFor={minutesId}>
            {t('class_timer_minutes')}
          </label>
          <Input
            id={minutesId}
            inputMode="numeric"
            max={180}
            min={1}
            onChange={(event) => setCustom(event.target.value)}
            placeholder={t('class_timer_preset', { minutes: 15 })}
            type="number"
            value={custom}
          />
        </div>
        <Button disabled={!customValid} size="sm" type="submit">
          {t('class_timer_start')}
        </Button>
      </form>
      {canControl && timer && (
        <div className="flex flex-wrap gap-2">
          {timer.status === 'running' && (
            <Button
              onClick={() => send('pause')}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('class_timer_pause')}
            </Button>
          )}
          {timer.status === 'paused' && (
            <Button
              onClick={() => send('resume')}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('class_timer_resume')}
            </Button>
          )}
          <Button
            onClick={() => send('stop')}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('class_timer_stop')}
          </Button>
        </div>
      )}
    </div>
  );
}
