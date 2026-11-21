'use client';

import {
  Clock3,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ResizableCallPanel } from '../../components/resizable-call-panel';
import { useMeetTool } from '../context';
import { CallPanelHeader, ToolAction } from '../tool-ui';
import {
  formatTimer,
  remainingMs,
  TIMER_PRESETS_MINUTES,
  timerStore,
} from './timer-store';

export function TimerToolPanel() {
  const store = timerStore;
  const { close } = useMeetTool();
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
    <ResizableCallPanel label={t('title')}>
      <CallPanelHeader
        icon={Timer}
        title={t('title')}
        subtitle={
          <>
            <LockKeyhole className="size-3" />
            {t('private')}
          </>
        }
        closeLabel={t('close')}
        onClose={close}
      />
      <div className="flex flex-col gap-5 p-4">
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
            'rounded-xl border bg-card py-8 text-center font-mono text-5xl tabular-nums',
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
      </div>
    </ResizableCallPanel>
  );
}
