'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useEffect, useId, useReducer, useState } from 'react';
import { SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import {
  elapsedMs,
  formatDuration,
  initialTrackState,
  totalTrackedMs,
  trackReducer,
} from '@/lib/showcase/track';
import { DemoPanel } from '../demo-panel';
import { fieldLabel } from '../styles';

const STATUS_LABELS = {
  idle: 'Ready',
  running: 'Running',
  paused: 'Paused',
} as const;

export function TrackDemo() {
  const [state, dispatch] = useReducer(trackReducer, initialTrackState);
  const [now, setNow] = useState(0);
  const labelId = useId();
  const { timer } = state;
  const running = timer.status === 'running';

  // Repaints the clock only; elapsed time is derived from the reducer state.
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running]);

  const stamp = () => {
    const value = Date.now();
    setNow(value);
    return value;
  };

  const elapsed = elapsedMs(timer, now);

  return (
    <DemoPanel label="Track demo" onReset={() => dispatch({ type: 'reset' })}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor={labelId}>
              What are you working on?
            </label>
            <Input
              autoComplete="off"
              id={labelId}
              maxLength={SHOWCASE_LIMITS.titleLength}
              onChange={(event) =>
                dispatch({ type: 'label', label: event.target.value })
              }
              value={state.label}
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-5 text-center">
            <p className="text-muted-foreground text-sm">
              {STATUS_LABELS[timer.status]}
            </p>
            <p
              aria-label={`Elapsed ${formatDuration(elapsed)}`}
              className="mt-1 font-mono font-semibold text-4xl tabular-nums tracking-tight sm:text-5xl"
              role="timer"
            >
              {formatDuration(elapsed)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button
                onClick={() => dispatch({ type: 'pause', now: stamp() })}
                type="button"
              >
                Pause
              </Button>
            ) : (
              <Button
                onClick={() => dispatch({ type: 'start', now: stamp() })}
                type="button"
              >
                {timer.status === 'paused' ? 'Resume' : 'Start'}
              </Button>
            )}
            <Button
              disabled={timer.status !== 'paused' || timer.elapsedMs <= 0}
              onClick={() => dispatch({ type: 'save' })}
              type="button"
              variant="secondary"
            >
              Save entry
            </Button>
            <Button
              disabled={timer.status === 'idle'}
              onClick={() => dispatch({ type: 'discard' })}
              type="button"
              variant="ghost"
            >
              Reset timer
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-sm">Today</h3>
            <p className="text-muted-foreground text-sm">
              Total{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatDuration(totalTrackedMs(state.entries))}
              </span>
            </p>
          </div>
          {state.entries.length === 0 ? (
            <p className="rounded-md border border-border border-dashed p-4 text-muted-foreground text-sm">
              Pause the timer and save an entry to log it here.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {state.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0 break-words text-sm">
                    {entry.label}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground text-sm tabular-nums">
                    {formatDuration(entry.durationMs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            Keeps the latest {SHOWCASE_LIMITS.timerEntries} entries.
          </p>
        </div>
      </div>
    </DemoPanel>
  );
}
