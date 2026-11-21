/** A device-local countdown that keeps running while its panel is closed. */
export type TimerState = {
  durationMs: number;
  /** Set while running. */
  endsAt: number | null;
  /** Remaining time while paused or idle. */
  remainingMs: number;
};

export const TIMER_PRESETS_MINUTES = [1, 3, 5, 10] as const;
const initial: TimerState = {
  durationMs: 5 * 60_000,
  endsAt: null,
  remainingMs: 5 * 60_000,
};

export function createTimerStore(start: TimerState = initial) {
  let state = start;
  const listeners = new Set<() => void>();
  const set = (next: TimerState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => state,
    choose(minutes: number) {
      const durationMs = minutes * 60_000;
      set({ durationMs, endsAt: null, remainingMs: durationMs });
    },
    start(now: number) {
      if (state.endsAt !== null) return;
      const remainingMs =
        state.remainingMs > 0 ? state.remainingMs : state.durationMs;
      set({ ...state, endsAt: now + remainingMs, remainingMs });
    },
    pause(now: number) {
      if (state.endsAt === null) return;
      set({ ...state, endsAt: null, remainingMs: remainingMs(state, now) });
    },
    reset() {
      set({ ...state, endsAt: null, remainingMs: state.durationMs });
    },
  };
}

export function remainingMs(state: TimerState, now: number) {
  return state.endsAt === null
    ? state.remainingMs
    : Math.max(0, state.endsAt - now);
}

export function formatTimer(ms: number) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const timerStore = createTimerStore();
