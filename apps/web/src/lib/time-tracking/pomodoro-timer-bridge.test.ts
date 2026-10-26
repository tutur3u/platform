import { describe, expect, it, vi } from 'vitest';
import type {
  PomodoroControlRow,
  PomodoroDeps,
  PomodoroStore,
} from './pomodoro-service';
import { PomodoroStoreError } from './pomodoro-service';
import {
  bridgeTimerSessionAction,
  switchPomodoroOff,
} from './pomodoro-timer-bridge';

const now = new Date('2026-10-26T10:00:00Z');
const inMinutes = (minutes: number) =>
  new Date(now.getTime() + minutes * 60_000).toISOString();

function focusRow(extra: Partial<PomodoroControlRow> = {}): PomodoroControlRow {
  return {
    revision: 3,
    mode: 'pomodoro',
    phase: 'focus',
    deadline_at: inMinutes(10),
    remaining_ms: 1_500_000,
    completed_focus: 0,
    prepared_session_id: 'focus-1',
    task_id: null,
    title: 'Write',
    config: {
      focus_minutes: 25,
      short_break_minutes: 5,
      long_break_minutes: 15,
      sessions_until_long_break: 4,
      auto_start_breaks: false,
      auto_start_focus: false,
    },
    ...extra,
  };
}

function setup(initial: PomodoroControlRow | null) {
  let row = initial;
  const apply = vi.fn<PomodoroStore['apply']>(async (input) => {
    if (!row || input.expectedRevision !== row.revision)
      throw new PomodoroStoreError('revision_conflict');
    const resumed = input.effects.some((effect) => effect.kind === 'resume');
    row = {
      ...row,
      revision: row.revision + 1,
      mode: input.next.phase === 'idle' ? 'off' : 'pomodoro',
      phase: input.next.phase,
      deadline_at: input.next.deadlineAt,
      prepared_session_id: resumed ? 'focus-2' : row.prepared_session_id,
    };
    return row;
  });
  const publish = vi.fn(async () => undefined);
  const deps: PomodoroDeps = {
    store: {
      read: async () => row,
      configure: vi.fn(),
      apply,
    },
    now: () => now,
    newId: () => crypto.randomUUID(),
    publish,
  };
  return { deps, apply, publish, row: () => row };
}

describe('bridgeTimerSessionAction', () => {
  it('leaves the Timer alone while the Pomodoro is off', async () => {
    const { deps, apply } = setup(focusRow({ mode: 'off', phase: 'idle' }));
    expect(
      await bridgeTimerSessionAction(deps, 'pause', {
        id: 'focus-1',
        parentSessionId: null,
      })
    ).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it('pauses the focus session as a Pomodoro command', async () => {
    const { deps, apply, publish } = setup(focusRow());
    const result = await bridgeTimerSessionAction(deps, 'pause', {
      id: 'focus-1',
      parentSessionId: null,
    });

    expect(result).toEqual({ sessionId: 'focus-1' });
    expect(apply.mock.calls[0]?.[0].effects).toEqual([
      { kind: 'pause', sessionId: 'focus-1' },
    ]);
    expect(publish).toHaveBeenCalledWith(4);
  });

  it('answers a resume with the new focus session', async () => {
    const { deps } = setup(focusRow({ deadline_at: null }));
    const result = await bridgeTimerSessionAction(deps, 'resume', {
      id: 'focus-1',
      parentSessionId: null,
    });
    expect(result).toEqual({ sessionId: 'focus-2' });
  });

  it('follows a session resumed from the focus session', async () => {
    const { deps, apply } = setup(focusRow());
    await bridgeTimerSessionAction(deps, 'stop', {
      id: 'child',
      parentSessionId: 'focus-1',
    });
    expect(apply.mock.calls[0]?.[0].next.phase).toBe('idle');
  });

  it('never touches the Pomodoro for another session stop or pause', async () => {
    const { deps, apply } = setup(focusRow());
    for (const action of ['stop', 'pause'] as const) {
      expect(
        await bridgeTimerSessionAction(deps, action, {
          id: 'manual',
          parentSessionId: null,
        })
      ).toBeNull();
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it('switches the Pomodoro off before another session resumes', async () => {
    const { deps, apply, row } = setup(focusRow());
    expect(
      await bridgeTimerSessionAction(deps, 'resume', {
        id: 'manual',
        parentSessionId: null,
      })
    ).toBeNull();
    expect(apply.mock.calls[0]?.[0].effects).toEqual([]);
    expect(row()?.mode).toBe('off');
  });

  it('falls back to the Timer and switches off when the command is refused', async () => {
    // The Pomodoro already has the focus paused, so a pause does not apply.
    const { deps, apply, row } = setup(focusRow({ deadline_at: null }));
    expect(
      await bridgeTimerSessionAction(deps, 'pause', {
        id: 'focus-1',
        parentSessionId: null,
      })
    ).toBeNull();
    expect(apply.mock.calls[0]?.[0].effects).toEqual([]);
    expect(row()?.mode).toBe('off');
  });
});

describe('switchPomodoroOff', () => {
  it('turns the Pomodoro off without session effects', async () => {
    const { deps, apply, publish, row } = setup(focusRow());
    await switchPomodoroOff(deps);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 3,
      effects: [],
      next: { phase: 'idle' },
    });
    expect(row()?.mode).toBe('off');
    expect(publish).toHaveBeenCalledWith(4);
  });

  it('does nothing when the Pomodoro is already off', async () => {
    const { deps, apply } = setup(null);
    await switchPomodoroOff(deps);
    expect(apply).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    const { deps } = setup(focusRow());
    deps.store.read = async () => {
      throw new PomodoroStoreError('unavailable');
    };
    await expect(switchPomodoroOff(deps)).resolves.toBeUndefined();
  });
});
