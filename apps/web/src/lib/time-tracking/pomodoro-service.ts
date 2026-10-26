import {
  commandKey,
  IDLE_FIELDS,
  type PomodoroCommand,
  type PomodoroConfig,
  type PomodoroControlState,
  type PomodoroPhase,
  planPomodoroCommand,
  pomodoroConfigSchema,
  projectPomodoro,
  type SessionEffect,
} from './pomodoro-control';

/**
 * The cross-device Pomodoro, framework-free. The route injects the store
 * (the database functions), the clock and the realtime publisher.
 *
 * GET is a pure projection. POST plans with the planner and lets the
 * database apply the plan under its lock; the database replays retries and
 * rejects stale revisions. Nothing here starts focus without a user command.
 */

/** The actor's private realtime topic (see `cloudflare_channel_role`). */
export const pomodoroTopic = (wsId: string, userId: string) =>
  `time-tracker-pomodoro-${wsId}-${userId}`;

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  sessions_until_long_break: 4,
  auto_start_breaks: false,
  auto_start_focus: false,
};

/** A control row as `read_time_tracker_control` returns it. */
export interface PomodoroControlRow {
  revision: number;
  mode: string;
  phase: string;
  deadline_at: string | null;
  remaining_ms?: number | null;
  completed_focus?: number | null;
  prepared_session_id: string | null;
  task_id?: string | null;
  title?: string | null;
  config?: unknown;
  mismatch?: boolean;
  replayed?: boolean;
}

export type PomodoroStoreErrorCode =
  | 'forbidden'
  | 'revision_conflict'
  | 'command_conflict'
  | 'timer_running'
  | 'invalid'
  | 'unavailable';

export class PomodoroStoreError extends Error {
  constructor(readonly code: PomodoroStoreErrorCode) {
    super(code);
  }
}

export interface PomodoroNextState {
  phase: PomodoroPhase;
  deadlineAt: string | null;
  remainingMs: number;
  completedFocus: number;
  taskId: string | null;
  title: string | null;
}

export interface PomodoroStore {
  read(): Promise<PomodoroControlRow | null>;
  configure(input: {
    expectedRevision: number;
    commandId: string;
    config: PomodoroConfig;
  }): Promise<PomodoroControlRow>;
  apply(input: {
    expectedRevision: number;
    commandId: string;
    command: Record<string, unknown>;
    next: PomodoroNextState;
    effects: SessionEffect[];
  }): Promise<PomodoroControlRow>;
}

export interface PomodoroDeps {
  store: PomodoroStore;
  now: () => Date;
  newId: () => string;
  /** Tells the actor's other clients to re-read. Never throws. */
  publish: (revision: number) => Promise<void>;
}

export interface PomodoroView {
  revision: number;
  phase: PomodoroPhase;
  deadlineAt: string | null;
  remainingMs: number;
  completedFocus: number;
  sessionId: string | null;
  taskId: string | null;
  title: string | null;
}

export type PomodoroResponse = {
  status: number;
  body: Record<string, unknown>;
};

const PHASES = new Set(['focus', 'short_break', 'long_break']);

const IDLE_ROW: PomodoroControlRow = {
  revision: 0,
  mode: 'off',
  phase: 'idle',
  deadline_at: null,
  prepared_session_id: null,
};

const isoOrNull = (value: string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

export function toPlannerState(
  row: PomodoroControlRow | null
): PomodoroControlState {
  const active = row?.mode === 'pomodoro' && PHASES.has(row.phase);
  if (!row || !active) {
    return {
      ...IDLE_FIELDS,
      revision: row?.revision ?? 0,
      lastCommandId: null,
      lastCommandKey: null,
    };
  }
  return {
    revision: row.revision,
    phase: row.phase as PomodoroPhase,
    deadlineAt: isoOrNull(row.deadline_at),
    remainingMs: row.remaining_ms ?? 0,
    completedFocus: row.completed_focus ?? 0,
    preparedSessionId: row.prepared_session_id,
    taskId: row.task_id ?? null,
    title: row.title ?? null,
    lastCommandId: null,
    lastCommandKey: null,
  };
}

export function toView(state: PomodoroControlState): PomodoroView {
  return {
    revision: state.revision,
    phase: state.phase,
    deadlineAt: state.deadlineAt,
    remainingMs: state.remainingMs,
    completedFocus: state.completedFocus,
    sessionId: state.preparedSessionId,
    taskId: state.taskId,
    title: state.title,
  };
}

function configOf(row: PomodoroControlRow | null): PomodoroConfig {
  const parsed = pomodoroConfigSchema.safeParse(row?.config);
  return parsed.success ? parsed.data : DEFAULT_POMODORO_CONFIG;
}

function nextOf(state: PomodoroControlState): PomodoroNextState {
  return {
    phase: state.phase,
    deadlineAt: state.deadlineAt,
    remainingMs: state.remainingMs,
    completedFocus: state.completedFocus,
    taskId: state.taskId,
    title: state.title,
  };
}

/** The read-only projection GET returns. It writes nothing. */
export async function readPomodoro(
  deps: Pick<PomodoroDeps, 'store' | 'now'>
): Promise<PomodoroResponse> {
  const row = await deps.store.read();
  const config = configOf(row);
  const view = projectPomodoro(toPlannerState(row), deps.now(), config);
  return {
    status: 200,
    body: {
      state: toView(view.state),
      deadlineAt: view.deadlineAt,
      serverNow: view.serverNow,
      config,
    },
  };
}

async function conflict(
  deps: PomodoroDeps,
  error: PomodoroStoreErrorCode
): Promise<PomodoroResponse> {
  const now = deps.now();
  const row = await deps.store.read();
  const view = projectPomodoro(toPlannerState(row), now, configOf(row));
  return {
    status: 409,
    body: {
      error,
      state: toView(view.state),
      deadlineAt: view.deadlineAt,
      serverNow: view.serverNow,
    },
  };
}

function failure(
  deps: PomodoroDeps,
  error: unknown
): Promise<PomodoroResponse> | PomodoroResponse {
  if (!(error instanceof PomodoroStoreError)) throw error;
  const serverNow = deps.now().toISOString();
  switch (error.code) {
    case 'revision_conflict':
    case 'command_conflict':
    case 'timer_running':
      return conflict(deps, error.code);
    case 'forbidden':
      return { status: 403, body: { error: 'forbidden', serverNow } };
    case 'invalid':
      return { status: 422, body: { error: 'invalid_transition', serverNow } };
    case 'unavailable':
      return { status: 503, body: { error: 'unavailable', serverNow } };
  }
}

function applied(
  row: PomodoroControlRow,
  serverNow: string,
  replayed: boolean
): PomodoroResponse {
  const state = toPlannerState(row);
  return {
    status: 200,
    body: {
      state: toView(state),
      deadlineAt: state.deadlineAt,
      serverNow,
      replayed,
      mismatch: row.mismatch === true,
    },
  };
}

/**
 * Plans and applies one command. Revision 0 means the actor has no control
 * yet: a `start` creates it with the default config first, and every other
 * command plans against the idle state without writing.
 */
export async function commandPomodoro(
  deps: PomodoroDeps,
  command: PomodoroCommand
): Promise<PomodoroResponse> {
  try {
    let row = await deps.store.read();
    const creating = !row && command.type === 'start';
    if (creating) {
      row = await deps.store.configure({
        expectedRevision: 0,
        commandId: deps.newId(),
        config: DEFAULT_POMODORO_CONFIG,
      });
    }
    // Revision 0 names a control that does not exist yet. It maps to the
    // first revision only when this request created that control; against
    // an existing control it is stale.
    const expectedRevision =
      creating && command.expectedRevision === 0
        ? 1
        : command.expectedRevision;
    const planned = { ...command, expectedRevision };
    const stored = toPlannerState(row);
    const now = deps.now();
    const plan = planPomodoroCommand(stored, planned, now, configOf(row));
    const serverNow = now.toISOString();
    const payload = JSON.parse(commandKey(planned)) as Record<string, unknown>;

    if (!plan.ok && plan.error === 'invalid_transition') {
      return {
        status: 422,
        body: { error: plan.error, state: toView(stored), serverNow },
      };
    }
    if (!row) return applied({ ...IDLE_ROW }, serverNow, false);
    if (!plan.ok) {
      if (expectedRevision < 1) return conflict(deps, 'revision_conflict');
      // A retry of an applied command arrives with an old revision; the
      // database replays it from its receipt or reports the conflict.
      const replay = await deps.store.apply({
        expectedRevision,
        commandId: command.commandId,
        command: payload,
        next: nextOf(stored),
        effects: [],
      });
      return applied(replay, serverNow, true);
    }
    if (plan.state === stored) return applied(row, serverNow, false);

    const result = await deps.store.apply({
      expectedRevision,
      commandId: command.commandId,
      command: payload,
      next: nextOf(plan.state),
      effects: plan.effects,
    });
    if (!result.replayed) await deps.publish(result.revision);
    return applied(result, serverNow, result.replayed === true);
  } catch (error) {
    return failure(deps, error);
  }
}

/** Changes the durations and auto-starts; a running phase keeps its session. */
export async function configurePomodoro(
  deps: PomodoroDeps,
  input: { expectedRevision: number; commandId: string; config: PomodoroConfig }
): Promise<PomodoroResponse> {
  try {
    const row = await deps.store.configure(input);
    await deps.publish(row.revision);
    const state = toPlannerState(row);
    return {
      status: 200,
      body: {
        state: toView(state),
        deadlineAt: state.deadlineAt,
        serverNow: deps.now().toISOString(),
        config: configOf(row),
      },
    };
  } catch (error) {
    return failure(deps, error);
  }
}
