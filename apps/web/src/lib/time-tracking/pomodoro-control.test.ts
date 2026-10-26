import { describe, expect, it } from 'vitest';
import {
  IDLE_CONTROL,
  type PomodoroConfig,
  type PomodoroControlState,
  planPomodoroCommand,
  pomodoroCommandSchema,
  reconcilePomodoro,
} from './pomodoro-control';

const config: PomodoroConfig = {
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  sessions_until_long_break: 4,
  auto_start_breaks: false,
  auto_start_focus: false,
};
const auto = { ...config, auto_start_breaks: true, auto_start_focus: true };
const t0 = new Date('2026-10-26T02:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const cmd = (type: string, revision: number, extra = {}) =>
  pomodoroCommandSchema.parse({
    type,
    commandId: '00000000-0000-4000-8000-000000000001',
    expectedRevision: revision,
    ...extra,
  });
const idle: PomodoroControlState = { ...IDLE_CONTROL, revision: 1 };

function focusing(sessionId = 's1'): PomodoroControlState {
  return {
    revision: 2,
    phase: 'focus',
    deadlineAt: at(25).toISOString(),
    remainingMs: 25 * 60_000,
    completedFocus: 0,
    sessionId,
    taskId: null,
    title: 'Write',
  };
}

describe('planPomodoroCommand', () => {
  it('starts a tagged focus session with a 25-minute deadline', () => {
    const plan = planPomodoroCommand(
      idle,
      cmd('start', 1, { title: 'Write' }),
      t0,
      config
    );
    expect(plan).toMatchObject({
      ok: true,
      state: { revision: 2, phase: 'focus', deadlineAt: at(25).toISOString() },
      effects: [{ kind: 'start', title: 'Write', tags: ['pomodoro'] }],
      alarmAt: at(25).toISOString(),
    });
  });

  it('rejects a stale revision', () => {
    expect(
      planPomodoroCommand(idle, cmd('start', 0, { title: 'x' }), t0, config)
    ).toEqual({ ok: false, error: 'revision_conflict' });
  });

  it('pauses and resumes with the remaining time', () => {
    const paused = planPomodoroCommand(
      focusing(),
      cmd('pause', 2),
      at(10),
      config
    );
    expect(paused).toMatchObject({
      ok: true,
      state: { deadlineAt: null, remainingMs: 15 * 60_000 },
      effects: [{ kind: 'pause', sessionId: 's1' }],
      alarmAt: null,
    });
    if (!paused.ok) return;
    const resumed = planPomodoroCommand(
      paused.state,
      cmd('resume', 3),
      at(12),
      config
    );
    expect(resumed).toMatchObject({
      ok: true,
      state: { deadlineAt: at(27).toISOString() },
      effects: [{ kind: 'resume', sessionId: 's1' }],
    });
  });

  it('refuses transitions that do not apply', () => {
    expect(planPomodoroCommand(idle, cmd('pause', 1), t0, config)).toEqual({
      ok: false,
      error: 'invalid_transition',
    });
    expect(planPomodoroCommand(idle, cmd('skip', 1), t0, config)).toEqual({
      ok: false,
      error: 'invalid_transition',
    });
  });

  it('stop closes the focus session and goes idle', () => {
    const plan = planPomodoroCommand(focusing(), cmd('stop', 2), at(3), config);
    expect(plan).toMatchObject({
      ok: true,
      state: { phase: 'idle', deadlineAt: null },
      effects: [{ kind: 'stop', sessionId: 's1', trimToIfAfterStart: null }],
    });
  });
});

describe('reconcilePomodoro', () => {
  it('a sleep across many cycles never auto-starts focus', () => {
    const { state, effects } = reconcilePomodoro(focusing(), at(180), auto);

    expect(effects).toEqual([
      {
        kind: 'stop',
        sessionId: 's1',
        trimToIfAfterStart: at(25).toISOString(),
      },
    ]);
    expect(state).toMatchObject({
      phase: 'focus',
      deadlineAt: null,
      sessionId: null,
    });
  });

  it('an on-time break end auto-starts focus from now', () => {
    const onBreak: PomodoroControlState = {
      ...focusing(),
      phase: 'short_break',
      sessionId: null,
      deadlineAt: at(30).toISOString(),
    };
    const { state, effects } = reconcilePomodoro(onBreak, at(30.5), auto);

    expect(effects).toEqual([
      { kind: 'start', title: 'Write', taskId: null, tags: ['pomodoro'] },
    ]);
    expect(state.deadlineAt).toBe(at(55.5).toISOString());
  });

  it('every fourth focus earns the long break', () => {
    const fourth = { ...focusing(), completedFocus: 3 };
    const { state } = reconcilePomodoro(fourth, at(25), config);
    expect(state).toMatchObject({ phase: 'long_break', remainingMs: 900_000 });
  });

  it('leaves a phase whose deadline is still ahead', () => {
    const { state, effects } = reconcilePomodoro(focusing(), at(10), auto);
    expect(effects).toEqual([]);
    expect(state).toEqual(focusing());
  });
});
