'use client';

import { Clock3, Pause, Play, RotateCcw } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ToolAction } from '../tool-ui';
import {
  formatTimer,
  remainingMs,
  TIMER_PRESETS_MINUTES,
  timerStore,
} from './timer-store';

/**
 * The device-local countdown: presets, the time left, start or pause and
 * reset. It never writes room state, and keeps running while hidden.
 */
export function PersonalTimer() {
  const store = timerStore;
  const t = useTranslations('meet.call.tools.timer');
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const running = state.endsAt !== null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running]);
  const left = remainingMs(state, now);
  const done = running && left === 0;
  const minutes = state.durationMs / 60_000;
  return (
    <>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('presets')}
      >
        {TIMER_PRESETS_MINUTES.map((preset) => (
          <ToolAction
            key={preset}
            icon={Clock3}
            label={t('preset', { count: preset })}
            variant={minutes === preset ? 'secondary' : 'outline'}
            aria-pressed={minutes === preset}
            onClick={() => store.choose(preset)}
          />
        ))}
      </div>
      <output
        aria-live={done ? 'assertive' : 'off'}
        className={cn(
          'rounded-2xl border bg-card py-6 text-center font-mono text-4xl tabular-nums @min-[360px]:py-8 @min-[360px]:text-5xl',
          running ? 'text-foreground' : 'text-muted-foreground',
          done && 'text-destructive'
        )}
      >
        {done ? t('done') : formatTimer(left)}
      </output>
      <div className="flex flex-wrap gap-2">
        {running && !done ? (
          <ToolAction
            variant="default"
            icon={Pause}
            label={t('pause')}
            onClick={() => store.pause(Date.now())}
          />
        ) : (
          <ToolAction
            variant="default"
            icon={Play}
            label={t('start')}
            disabled={done}
            onClick={() => store.start(Date.now())}
          />
        )}
        <ToolAction
          icon={RotateCcw}
          label={t('reset')}
          onClick={() => store.reset()}
        />
      </div>
    </>
  );
}
