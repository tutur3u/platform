import { z } from 'zod';

/**
 * DRAFT: the single state machine for the cross-device Pomodoro.
 *
 * Pure and framework-free. The route plans with these functions; the
 * database function only validates and applies the plan atomically under
 * the tracker's advisory lock, with revision CAS and command replay. Nothing
 * calls this until the migration in `mobile-pomodoro-cross-device.mdx` is
 * approved.
 *
 * Rules:
 * - Nothing server-triggered starts focus. `reconcilePomodoro` (run before
 *   every command, by the `reconcile` command and for read projections)
 *   ends phases whose deadline passed; a break that ends there leaves focus
 *   waiting for the user. Only a user command (`start`, `resume`, or `skip`
 *   out of a break with auto-start on) starts a focus session.
 * - A focus phase counts toward the long break only when it ran to its
 *   deadline; a skipped focus does not.
 * - A late-closed focus session is trimmed back to its deadline only when
 *   that is after the session's start (the database knows the start).
 * - Commands replay by id: the same id with the same payload returns the
 *   stored state without changes; a different payload is a conflict.
 * - A command that changes nothing (stop while idle) keeps the revision.
 */

export const ON_TIME_MS = 60_000;

export const pomodoroConfigSchema = z.object({
  focus_minutes: z.number().int().min(1).max(180),
  short_break_minutes: z.number().int().min(1).max(180),
  long_break_minutes: z.number().int().min(1).max(180),
  sessions_until_long_break: z.number().int().min(1).max(24),
  auto_start_breaks: z.boolean(),
  auto_start_focus: z.boolean(),
});
export type PomodoroConfig = z.infer<typeof pomodoroConfigSchema>;

export type PomodoroPhase = 'idle' | 'focus' | 'short_break' | 'long_break';

export interface PomodoroControlState {
  revision: number;
  phase: PomodoroPhase;
  /** Set while the phase runs; null while paused or waiting. */
  deadlineAt: string | null;
  /** Time left while paused or waiting, in milliseconds. */
  remainingMs: number;
  completedFocus: number;
  /** The focus session; stored in the foundation's `prepared_session_id`. */
  preparedSessionId: string | null;
  taskId: string | null;
  title: string | null;
  /** The last applied command, for replay. */
  lastCommandId: string | null;
  lastCommandKey: string | null;
}

export const IDLE_FIELDS = {
  phase: 'idle',
  deadlineAt: null,
  remainingMs: 0,
  completedFocus: 0,
  preparedSessionId: null,
  taskId: null,
  title: null,
} as const satisfies Partial<PomodoroControlState>;

const commandBase = {
  commandId: z.guid(),
  expectedRevision: z.number().int().min(0),
};

export const pomodoroCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    ...commandBase,
    title: z.string().trim().min(1).max(255),
    taskId: z.guid().nullable().optional(),
  }),
  z.object({ type: z.literal('pause'), ...commandBase }),
  z.object({ type: z.literal('resume'), ...commandBase }),
  z.object({ type: z.literal('skip'), ...commandBase }),
  z.object({ type: z.literal('stop'), ...commandBase }),
  // Persists due phase ends. Clients send it when they foreground or open a
  // phase-end notification; it never starts focus.
  z.object({ type: z.literal('reconcile'), ...commandBase }),
]);
export type PomodoroCommand = z.infer<typeof pomodoroCommandSchema>;

/** Session work the database applies in the same transaction. */
export type SessionEffect =
  | { kind: 'start'; title: string; taskId: string | null; tags: ['pomodoro'] }
  | { kind: 'pause'; sessionId: string }
  | { kind: 'resume'; sessionId: string }
  | { kind: 'stop'; sessionId: string; trimToIfAfterStart: string | null };

export type PlanResult =
  | {
      ok: true;
      /** True when the command id was already applied. */
      replayed: boolean;
      state: PomodoroControlState;
      effects: SessionEffect[];
      /** The shared deadline clients schedule local notifications for. */
      deadlineAt: string | null;
      serverNow: string;
    }
  | {
      ok: false;
      error: 'revision_conflict' | 'command_conflict' | 'invalid_transition';
      serverNow: string;
    };

const iso = (ms: number) => new Date(ms).toISOString();

/** A stable key of a command's payload, for replay checks. */
export function commandKey(command: PomodoroCommand): string {
  const { commandId: _id, expectedRevision: _revision, ...payload } = command;
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function phaseMs(phase: PomodoroPhase, config: PomodoroConfig): number {
  const minutes =
    phase === 'short_break'
      ? config.short_break_minutes
      : phase === 'long_break'
        ? config.long_break_minutes
        : config.focus_minutes;
  return minutes * 60_000;
}

function focusStart(state: PomodoroControlState): SessionEffect {
  return {
    kind: 'start',
    title: state.title ?? 'Focus',
    taskId: state.taskId,
    tags: ['pomodoro'],
  };
}

/**
 * Ends the current phase. `byUser` is true only for a user's `skip`; then
 * an auto-started focus may start a session. A focus that did not run to
 * its deadline (a skip) does not count toward the long break.
 */
function completePhase(
  state: PomodoroControlState,
  nowMs: number,
  config: PomodoroConfig,
  effects: SessionEffect[],
  byUser: boolean
): PomodoroControlState {
  const deadlineMs = state.deadlineAt ? Date.parse(state.deadlineAt) : null;
  const reachedDeadline = deadlineMs !== null && deadlineMs <= nowMs;
  const late = deadlineMs !== null && nowMs - deadlineMs > ON_TIME_MS;
  if (state.phase === 'focus') {
    if (state.preparedSessionId) {
      effects.push({
        kind: 'stop',
        sessionId: state.preparedSessionId,
        trimToIfAfterStart:
          late && deadlineMs !== null ? iso(deadlineMs) : null,
      });
    }
    const completedFocus = state.completedFocus + (reachedDeadline ? 1 : 0);
    const phase: PomodoroPhase =
      reachedDeadline && completedFocus % config.sessions_until_long_break === 0
        ? 'long_break'
        : 'short_break';
    const length = phaseMs(phase, config);
    const startMs = late && deadlineMs !== null ? deadlineMs : nowMs;
    return {
      ...state,
      phase,
      completedFocus,
      preparedSessionId: null,
      remainingMs: length,
      deadlineAt: config.auto_start_breaks ? iso(startMs + length) : null,
    };
  }
  const length = phaseMs('focus', config);
  // Only a user's skip may auto-start focus; server-side ends never do.
  const autoStart = byUser && config.auto_start_focus;
  if (autoStart) effects.push(focusStart(state));
  return {
    ...state,
    phase: 'focus',
    remainingMs: length,
    // The database fills in the id of the session it starts.
    preparedSessionId: null,
    deadlineAt: autoStart ? iso(nowMs + length) : null,
  };
}

/**
 * Ends every phase whose deadline has passed. Server-side and read paths
 * use it; it never starts focus.
 */
export function reconcilePomodoro(
  state: PomodoroControlState,
  now: Date,
  config: PomodoroConfig
): { state: PomodoroControlState; effects: SessionEffect[] } {
  const nowMs = now.getTime();
  const effects: SessionEffect[] = [];
  let next = state;
  while (
    next.phase !== 'idle' &&
    next.deadlineAt !== null &&
    Date.parse(next.deadlineAt) <= nowMs
  ) {
    next = completePhase(next, nowMs, config, effects, false);
  }
  return { state: next, effects };
}

/**
 * The read-only view GET returns: the stored state as it is due now. GET
 * writes nothing; the projection's phase ends are persisted by the next
 * command (every command reconciles first) or a `reconcile` command.
 */
export function projectPomodoro(
  stored: PomodoroControlState,
  now: Date,
  config: PomodoroConfig
): {
  state: PomodoroControlState;
  deadlineAt: string | null;
  serverNow: string;
} {
  const { state } = reconcilePomodoro(stored, now, config);
  return { state, deadlineAt: state.deadlineAt, serverNow: now.toISOString() };
}

/** Plans a command against the stored state (reconciled first). */
export function planPomodoroCommand(
  stored: PomodoroControlState,
  command: PomodoroCommand,
  now: Date,
  config: PomodoroConfig
): PlanResult {
  const serverNow = now.toISOString();
  const key = commandKey(command);
  if (command.commandId === stored.lastCommandId) {
    return stored.lastCommandKey === key
      ? {
          ok: true,
          replayed: true,
          state: stored,
          effects: [],
          deadlineAt: stored.deadlineAt,
          serverNow,
        }
      : { ok: false, error: 'command_conflict', serverNow };
  }
  if (command.expectedRevision !== stored.revision) {
    return { ok: false, error: 'revision_conflict', serverNow };
  }
  const nowMs = now.getTime();
  const reconciled = reconcilePomodoro(stored, now, config);
  const effects = [...reconciled.effects];
  const state = reconciled.state;
  const deadlineMs = state.deadlineAt ? Date.parse(state.deadlineAt) : null;
  const paused = state.phase !== 'idle' && deadlineMs === null;

  const applied = (next: PomodoroControlState): PlanResult => {
    const changed =
      effects.length > 0 || JSON.stringify(next) !== JSON.stringify(stored);
    const final = changed
      ? {
          ...next,
          revision: stored.revision + 1,
          lastCommandId: command.commandId,
          lastCommandKey: key,
        }
      : stored;
    return {
      ok: true,
      replayed: false,
      state: final,
      effects,
      deadlineAt: final.deadlineAt,
      serverNow,
    };
  };
  const invalid: PlanResult = {
    ok: false,
    error: 'invalid_transition',
    serverNow,
  };

  switch (command.type) {
    case 'reconcile':
      return applied(state);
    case 'start': {
      if (state.phase === 'focus' && state.preparedSessionId) {
        effects.push({
          kind: 'stop',
          sessionId: state.preparedSessionId,
          trimToIfAfterStart: null,
        });
      }
      effects.push({
        kind: 'start',
        title: command.title,
        taskId: command.taskId ?? null,
        tags: ['pomodoro'],
      });
      const length = phaseMs('focus', config);
      return applied({
        ...state,
        phase: 'focus',
        completedFocus: state.phase === 'idle' ? 0 : state.completedFocus,
        deadlineAt: iso(nowMs + length),
        remainingMs: length,
        preparedSessionId: null,
        taskId: command.taskId ?? null,
        title: command.title,
      });
    }
    case 'pause': {
      if (state.phase === 'idle' || deadlineMs === null) return invalid;
      if (state.phase === 'focus' && state.preparedSessionId) {
        effects.push({ kind: 'pause', sessionId: state.preparedSessionId });
      }
      const left = Math.max(0, deadlineMs - nowMs);
      return applied({ ...state, deadlineAt: null, remainingMs: left });
    }
    case 'resume': {
      if (!paused) return invalid;
      if (state.phase === 'focus') {
        effects.push(
          state.preparedSessionId
            ? { kind: 'resume', sessionId: state.preparedSessionId }
            : focusStart(state)
        );
      }
      return applied({ ...state, deadlineAt: iso(nowMs + state.remainingMs) });
    }
    case 'skip': {
      if (state.phase === 'idle') return invalid;
      return applied(completePhase(state, nowMs, config, effects, true));
    }
    case 'stop': {
      if (state.phase === 'focus' && state.preparedSessionId) {
        effects.push({
          kind: 'stop',
          sessionId: state.preparedSessionId,
          trimToIfAfterStart: null,
        });
      }
      return applied({ ...state, ...IDLE_FIELDS });
    }
  }
}
