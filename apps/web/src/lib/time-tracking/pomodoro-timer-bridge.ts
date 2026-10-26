import {
  commandPomodoro,
  type PomodoroControlRow,
  type PomodoroDeps,
  PomodoroStoreError,
  type PomodoroView,
} from './pomodoro-service';

/**
 * Keeps the Timer's own session actions and the cross-device Pomodoro in
 * step (framework-free; the legacy session routes inject the deps).
 *
 * - Stop, pause or resume of the Pomodoro's own focus session runs as the
 *   matching Pomodoro command, so the shared phase follows the Timer.
 * - Starting a timer, or resuming another session, switches the Pomodoro
 *   OFF first without touching any session; the Timer then acts as before.
 * - Stop, pause or edit of another session leaves the Pomodoro alone.
 *
 * A manual timer is never closed by the Pomodoro, and nothing here starts
 * focus. The Pomodoro switches OFF only when its session moved elsewhere
 * (`mismatch`) or the command no longer applies (422). A revision conflict
 * is retried once against the fresh state, then answered with a 409. Other
 * failures fall back to the Timer's own behaviour.
 */

export type TimerSessionAction = 'stop' | 'pause' | 'resume';

export type TimerBridgeResult =
  | { sessionId: string }
  | { conflict: true }
  | null;

export interface TimerSessionRef {
  id: string;
  parentSessionId: string | null;
}

const isPomodoro = (
  row: PomodoroControlRow | null
): row is PomodoroControlRow => row?.mode === 'pomodoro';

function owns(row: PomodoroControlRow, session: TimerSessionRef) {
  const focus = row.prepared_session_id;
  return (
    focus !== null &&
    (session.id === focus || session.parentSessionId === focus)
  );
}

/** Ends the Pomodoro without session effects. Never throws. */
export async function switchPomodoroOff(
  deps: PomodoroDeps,
  known?: PomodoroControlRow | null
): Promise<void> {
  try {
    let row = known === undefined ? await deps.store.read() : known;
    for (let attempt = 0; attempt < 2 && isPomodoro(row); attempt++) {
      try {
        const result = await deps.store.apply({
          expectedRevision: row.revision,
          commandId: deps.newId(),
          command: { type: 'stop', source: 'timer' },
          next: {
            phase: 'idle',
            deadlineAt: null,
            remainingMs: 0,
            completedFocus: 0,
            taskId: null,
            title: null,
          },
          effects: [],
        });
        await deps.publish(result.revision);
        return;
      } catch (error) {
        if (
          !(error instanceof PomodoroStoreError) ||
          error.code !== 'revision_conflict'
        )
          throw error;
        row = await deps.store.read();
      }
    }
  } catch (error) {
    console.warn('Could not switch the Pomodoro off for the Timer:', error);
  }
}

/**
 * Runs a Timer stop, pause or resume through the Pomodoro when the session
 * is its focus session. Returns the session to answer with, a conflict for
 * a 409, or null when the Timer should act as before.
 */
export async function bridgeTimerSessionAction(
  deps: PomodoroDeps,
  action: TimerSessionAction,
  session: TimerSessionRef
): Promise<TimerBridgeResult> {
  let row: PomodoroControlRow | null;
  try {
    row = await deps.store.read();
  } catch (error) {
    console.warn('Could not read the Pomodoro for the Timer:', error);
    return null;
  }
  if (!isPomodoro(row)) return null;
  if (!owns(row, session)) {
    // Resuming another session would close the focus session.
    if (action === 'resume') await switchPomodoroOff(deps, row);
    return null;
  }
  const run = (expectedRevision: number) =>
    commandPomodoro(deps, {
      type: action,
      commandId: deps.newId(),
      expectedRevision,
    });
  let result = await run(row.revision);
  if (result.status === 409 && result.body.error === 'revision_conflict') {
    // The Pomodoro moved on: retry only if the session is still its own.
    let fresh: PomodoroControlRow | null;
    try {
      fresh = await deps.store.read();
    } catch {
      return { conflict: true };
    }
    if (!isPomodoro(fresh)) return null;
    if (!owns(fresh, session)) {
      if (action === 'resume') await switchPomodoroOff(deps, fresh);
      return null;
    }
    result = await run(fresh.revision);
  }
  if (result.status === 200 && result.body.mismatch !== true) {
    const state = result.body.state as PomodoroView;
    return {
      sessionId:
        action === 'resume' ? (state.sessionId ?? session.id) : session.id,
    };
  }
  if (result.status === 409) return { conflict: true };
  // The database already switched a mismatch OFF; this covers the 422.
  if (result.status === 422 || result.body.mismatch === true)
    await switchPomodoroOff(deps);
  return null;
}
