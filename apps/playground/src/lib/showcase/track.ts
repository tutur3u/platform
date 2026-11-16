import { cleanText, SHOWCASE_LIMITS } from './limits';

/** A running timer stops counting after this long. */
export const TRACK_MAX_MS = 24 * 60 * 60 * 1000;

export type TrackEntry = { id: number; label: string; durationMs: number };

/** Timer machine: idle has no time, paused keeps it, running adds to it. */
export type TrackTimer =
  | { status: 'idle' }
  | { status: 'running'; elapsedMs: number; startedAt: number }
  | { status: 'paused'; elapsedMs: number };

export type TrackState = {
  timer: TrackTimer;
  label: string;
  entries: TrackEntry[];
  nextId: number;
};

/** Time arrives with the action, so the reducer stays pure. */
export type TrackAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'label'; label: string }
  | { type: 'save' }
  /** Clears the current timer and keeps saved entries. */
  | { type: 'discard' }
  /** Restores the whole demo. */
  | { type: 'reset' };

export const initialTrackState: TrackState = {
  timer: { status: 'idle' },
  label: 'Write the weekly update',
  entries: [
    { id: 1, label: 'Inbox triage', durationMs: 25 * 60 * 1000 },
    { id: 2, label: 'Planning', durationMs: 45 * 60 * 1000 },
  ],
  nextId: 3,
};

export function elapsedMs(timer: TrackTimer, now: number): number {
  switch (timer.status) {
    case 'idle':
      return 0;
    case 'paused':
      return timer.elapsedMs;
    case 'running':
      return Math.min(
        TRACK_MAX_MS,
        timer.elapsedMs + Math.max(0, now - timer.startedAt)
      );
  }
}

export function totalTrackedMs(entries: readonly TrackEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.durationMs, 0);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function trackReducer(
  state: TrackState,
  action: TrackAction
): TrackState {
  switch (action.type) {
    case 'start':
      if (state.timer.status === 'running') return state;
      return {
        ...state,
        timer: {
          status: 'running',
          elapsedMs: elapsedMs(state.timer, action.now),
          startedAt: action.now,
        },
      };
    case 'pause':
      if (state.timer.status !== 'running') return state;
      return {
        ...state,
        timer: {
          status: 'paused',
          elapsedMs: elapsedMs(state.timer, action.now),
        },
      };
    case 'label':
      return {
        ...state,
        label: action.label.slice(0, SHOWCASE_LIMITS.titleLength),
      };
    case 'save': {
      if (state.timer.status !== 'paused' || state.timer.elapsedMs <= 0)
        return state;
      const entry: TrackEntry = {
        id: state.nextId,
        label:
          cleanText(state.label, SHOWCASE_LIMITS.titleLength) || 'Untitled',
        durationMs: state.timer.elapsedMs,
      };
      return {
        ...state,
        timer: { status: 'idle' },
        entries: [entry, ...state.entries].slice(
          0,
          SHOWCASE_LIMITS.timerEntries
        ),
        nextId: state.nextId + 1,
      };
    }
    case 'discard':
      return state.timer.status === 'idle'
        ? state
        : { ...state, timer: { status: 'idle' } };
    case 'reset':
      return initialTrackState;
  }
}
