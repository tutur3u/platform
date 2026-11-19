'use client';

import { Clock3 } from '@tuturuuu/icons';
import {
  CLASS_TIMER_PRESETS_MS,
  formatClassTimer,
} from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { CallState } from '../lib/call-state';
import { AttendancePanel } from './attendance-panel';
import { RoomCountdown } from './room-countdown';

type TimerAction = 'start' | 'pause' | 'resume' | 'stop';

export function CallClock({
  meetingId,
  state,
  room,
}: {
  meetingId: string;
  state: CallState;
  room: {
    commandClassTimer: (action: TimerAction, durationMs?: number) => void;
  };
}) {
  const canStart = state.classRole === 'host' || state.classRole === 'cohost';
  const canView = canStart && state.classAttendanceEnabled;
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1">
      <RoomCountdown expiresAt={state.roomExpiresAt} />
      {state.classTimerEnabled && (canStart || state.classTimer) && (
        <ClassTimerControl
          canControl={state.classRole === 'host'}
          canStart={canStart}
          onCommand={room.commandClassTimer}
          serverNow={state.classTimerServerNow}
          timer={state.classTimer}
        />
      )}
      {canView && <AttendancePanel meetingId={meetingId} />}
    </div>
  );
}

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

function ClassTimerControl({
  canControl,
  canStart,
  onCommand,
  serverNow,
  timer,
}: {
  canControl: boolean;
  canStart: boolean;
  onCommand: (action: TimerAction, durationMs?: number) => void;
  serverNow: string | null;
  timer: CallState['classTimer'];
}) {
  const t = useTranslations('meet.call');
  const [custom, setCustom] = useState('15');
  const clock = useSyncedClock(serverNow, timer?.status === 'running');
  const remaining = !timer
    ? null
    : timer.status === 'paused'
      ? timer.remainingMs
      : timer.status === 'ended' || !timer.endsAt
        ? 0
        : Math.max(0, Date.parse(timer.endsAt) - clock);
  const ended = timer?.status === 'ended' || remaining === 0;
  const label = !timer
    ? t('class_timer')
    : ended
      ? t('class_timer_ended')
      : t('class_timer_remaining', {
          time: formatClassTimer(remaining ?? 0),
        });
  const customMinutes = Number(custom);
  const customValid =
    Number.isInteger(customMinutes) &&
    customMinutes >= 1 &&
    customMinutes <= 180;
  const chip = (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-sm',
        ended &&
          timer &&
          'motion-safe:animate-pulse bg-dynamic-orange/15 text-dynamic-orange'
      )}
      role="status"
    >
      <Clock3 className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
  if (!canStart) return chip;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('class_timer')}
          className="h-9 max-w-full px-1"
          size="sm"
          type="button"
          variant="ghost"
        >
          {chip}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(18rem,calc(100vw-2rem))] space-y-3"
      >
        <p className="font-medium text-sm">{t('class_timer')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CLASS_TIMER_PRESETS_MS.map((durationMs) => (
            <Button
              key={durationMs}
              onClick={() => onCommand('start', durationMs)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('class_timer_preset', { minutes: durationMs / 60_000 })}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">
          {t('class_timer_custom')}
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (customValid) onCommand('start', customMinutes * 60_000);
          }}
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            {t('class_timer_minutes')}
            <Input
              inputMode="numeric"
              max={180}
              min={1}
              onChange={(event) => setCustom(event.target.value)}
              type="number"
              value={custom}
            />
          </label>
          <Button disabled={!customValid} size="sm" type="submit">
            {t('class_timer_start')}
          </Button>
        </form>
        {canControl && timer && timer.status !== 'ended' && (
          <div className="flex flex-wrap gap-2">
            {timer.status === 'running' ? (
              <Button
                onClick={() => onCommand('pause')}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('class_timer_pause')}
              </Button>
            ) : (
              <Button
                onClick={() => onCommand('resume')}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('class_timer_resume')}
              </Button>
            )}
            <Button
              onClick={() => onCommand('stop')}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('class_timer_stop')}
            </Button>
          </div>
        )}
        {canControl && timer?.status === 'ended' && (
          <Button
            onClick={() => onCommand('stop')}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('class_timer_stop')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
