'use client';

import { Clock3 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useMeetingTimeZone } from './meeting-local-time';

/** The ring counts down the time available when this device joins the room. */
export function countdownState(deadline: number, started: number, now: number) {
  const remaining = Math.max(0, deadline - now);
  const total = Math.max(1, deadline - started);
  return { remaining, fraction: Math.min(1, remaining / total) };
}

/** Hover/focus for a tooltip; tap/click for the same details on touch devices. */
export function RoomCountdown({ expiresAt }: { expiresAt?: string }) {
  const t = useTranslations('meet.call');
  const format = useFormatter();
  const timeZone = useMeetingTimeZone();
  const [clock, setClock] = useState<{ started: number; now: number } | null>(
    null
  );
  const deadline = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    const started = Date.now();
    setClock({ started, now: started });
    const timer = setInterval(
      () => setClock({ started, now: Date.now() }),
      1000
    );
    return () => clearInterval(timer);
  }, [deadline]);
  if (!Number.isFinite(deadline)) return null;
  const { remaining, fraction } = clock
    ? countdownState(deadline, clock.started, clock.now)
    : { remaining: null, fraction: 1 };
  const minutes = remaining === null ? 0 : Math.ceil(remaining / 60_000);
  const time =
    minutes >= 60
      ? t('room_time_hours', {
          hours: Math.floor(minutes / 60),
          minutes: minutes % 60,
        })
      : remaining !== null && remaining > 0 && remaining < 60_000
        ? t('room_time_seconds', { seconds: Math.ceil(remaining / 1000) })
        : minutes > 0
          ? t('room_time_minutes', { minutes })
          : t('room_time_expired');
  const label = remaining === null ? t('room_time_limit') : time;
  const deadlineLabel = t('room_deadline', {
    time: timeZone
      ? format.dateTime(new Date(deadline), {
          timeZone,
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : '—',
  });
  const details = (
    <div className="space-y-1">
      <p className="font-medium">{label}</p>
      <p className="text-xs opacity-80">{deadlineLabel}</p>
    </div>
  );
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t('room_time_action')}
              className={cn(
                'relative size-9 shrink-0 rounded-full',
                remaining !== null &&
                  remaining <= 300_000 &&
                  'text-dynamic-orange',
                remaining !== null && remaining <= 60_000 && 'text-dynamic-red'
              )}
              size="icon"
              variant="ghost"
              type="button"
            >
              <svg
                viewBox="0 0 36 36"
                className="absolute inset-0 size-full -rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="opacity-15"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset={100 * (1 - fraction)}
                  strokeLinecap="round"
                />
              </svg>
              <Clock3 className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{details}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-auto max-w-xs text-sm">
        {details}
      </PopoverContent>
    </Popover>
  );
}
