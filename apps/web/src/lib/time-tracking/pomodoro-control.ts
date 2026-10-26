import { z } from 'zod';

/**
 * DRAFT: the server-side Pomodoro planner for cross-device phases.
 *
 * Pure and framework-free. Given the stored control state, a command and
 * the clock, it returns the next state plus the session effects that the
 * (not yet written) control RPC must apply atomically under the tracker's
 * advisory lock. It mirrors the device Pomodoro rules:
 * - a phase that ended more than `ON_TIME_MS` ago ended unattended, and
 *   focus never auto-starts after it;
 * - an auto-started focus counts its deadline from its real start;
 * - a late-closed focus session is trimmed back to its deadline only when
 *   that is after the session's start (the RPC knows the start).
 *
 * Nothing calls this until the migration in the cross-device design is
 * approved; see `mobile-pomodoro-cross-device.mdx`.
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
  sessionId: string | null;
  taskId: string | null;
  title: string | null;
}

export const IDLE_CONTROL: Omit<PomodoroControlState, 'revision'> = {
  phase: 'idle',
  deadlineAt: null,
  remainingMs: 0,
  completedFocus: 0,
  sessionId: null,
  taskId: null,
  title: null,
};

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
]);
export type PomodoroCommand = z.infer<typeof pomodoroCommandSchema>;

/** Session work the control RPC performs in the same transaction. */
export type SessionEffect =
  | { kind: 'start'; title: string; taskId: string | null; tags: ['pomodoro'] }
  | { kind: 'pause'; sessionId: string }
  | { kind: 'resume'; sessionId: string }
  | { kind: 'stop'; sessionId: string; trimToIfAfterStart: string | null };

export type PlanResult =
  | {
      ok: true;
      state: PomodoroControlState;
      effects: SessionEffect[];
      /** When the next deadline alarm should fire, if any. */
      alarmAt: string | null;
    }
  | { ok: false; error: 'revision_conflict' | 'invalid_transition' };

const iso = (ms: number) => new Date(ms).toISOString();

function phaseMs(phase: PomodoroPhase, config: PomodoroConfig): number {
  const minutes =
    phase === 'short_break'
      ? config.short_break_minutes
      : phase === 'long_break'
        ? config.long_break_minutes
        : config.focus_minutes;
  return minutes * 60_000;
}

function done(
  state: PomodoroControlState,
  effects: SessionEffect[]
): PlanResult {
  return { ok: true, state, effects, alarmAt: state.deadlineAt };
}

/** Ends the current phase at `nowMs` and moves to the next one. */
function completePhase(
  state: PomodoroControlState,
  nowMs: number,
  config: PomodoroConfig,
  effects: SessionEffect[]
): PomodoroControlState {
  const deadlineMs = state.deadlineAt ? Date.parse(state.deadlineAt) : null;
  const late = deadlineMs !== null && nowMs - deadlineMs > ON_TIME_MS;
  if (state.phase === 'focus') {
    if (state.sessionId) {
      effects.push({
        kind: 'stop',
        sessionId: state.sessionId,
        trimToIfAfterStart:
          late && deadlineMs !== null ? iso(deadlineMs) : null,
      });
    }
    const completedFocus = state.completedFocus + 1;
    const phase: PomodoroPhase =
      completedFocus % config.sessions_until_long_break === 0
        ? 'long_break'
        : 'short_break';
    const length = phaseMs(phase, config);
    const startMs = late && deadlineMs !== null ? deadlineMs : nowMs;
    return {
      ...state,
      phase,
      completedFocus,
      sessionId: null,
      remainingMs: length,
      deadlineAt: config.auto_start_breaks ? iso(startMs + length) : null,
    };
  }
  const length = phaseMs('focus', config);
  const autoStart = config.auto_start_focus && !late;
  if (autoStart) {
    effects.push({
      kind: 'start',
      title: state.title ?? 'Focus',
      taskId: state.taskId,
      tags: ['pomodoro'],
    });
  }
  return {
    ...state,
    phase: 'focus',
    remainingMs: length,
    // The RPC fills in the id of the session it starts.
    sessionId: null,
    deadlineAt: autoStart ? iso(nowMs + length) : null,
  };
}

/**
 * Ends every phase whose deadline has passed. Run before each command and
 * by the deadline alarm; it never auto-starts focus for a missed phase.
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
    next = completePhase(next, nowMs, config, effects);
  }
  return { state: next, effects };
}

/** Plans a command against the stored state (reconciled first). */
export function planPomodoroCommand(
  stored: PomodoroControlState,
  command: PomodoroCommand,
  now: Date,
  config: PomodoroConfig
): PlanResult {
  if (command.expectedRevision !== stored.revision) {
    return { ok: false, error: 'revision_conflict' };
  }
  const nowMs = now.getTime();
  const reconciled = reconcilePomodoro(stored, now, config);
  const effects = [...reconciled.effects];
  const state = { ...reconciled.state, revision: stored.revision + 1 };
  const running = state.phase !== 'idle' && state.deadlineAt !== null;
  const paused = state.phase !== 'idle' && state.deadlineAt === null;

  switch (command.type) {
    case 'start': {
      if (state.phase === 'focus' && state.sessionId) {
        effects.push({
          kind: 'stop',
          sessionId: state.sessionId,
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
      return done(
        {
          ...state,
          phase: 'focus',
          completedFocus: state.phase === 'idle' ? 0 : state.completedFocus,
          deadlineAt: iso(nowMs + length),
          remainingMs: length,
          sessionId: null,
          taskId: command.taskId ?? null,
          title: command.title,
        },
        effects
      );
    }
    case 'pause': {
      if (!running) return { ok: false, error: 'invalid_transition' };
      if (state.phase === 'focus' && state.sessionId) {
        effects.push({ kind: 'pause', sessionId: state.sessionId });
      }
      const left = Math.max(0, Date.parse(state.deadlineAt!) - nowMs);
      return done({ ...state, deadlineAt: null, remainingMs: left }, effects);
    }
    case 'resume': {
      if (!paused) return { ok: false, error: 'invalid_transition' };
      if (state.phase === 'focus') {
        effects.push(
          state.sessionId
            ? { kind: 'resume', sessionId: state.sessionId }
            : {
                kind: 'start',
                title: state.title ?? 'Focus',
                taskId: state.taskId,
                tags: ['pomodoro'],
              }
        );
      }
      return done(
        { ...state, deadlineAt: iso(nowMs + state.remainingMs) },
        effects
      );
    }
    case 'skip': {
      if (state.phase === 'idle') {
        return { ok: false, error: 'invalid_transition' };
      }
      return done(completePhase(state, nowMs, config, effects), effects);
    }
    case 'stop': {
      if (state.phase === 'focus' && state.sessionId) {
        effects.push({
          kind: 'stop',
          sessionId: state.sessionId,
          trimToIfAfterStart: null,
        });
      }
      return done({ ...IDLE_CONTROL, revision: state.revision }, effects);
    }
  }
}
