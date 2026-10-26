import { describe, expect, it } from 'vitest';
import {
  IDLE_FIELDS,
  type PomodoroCommand,
  type PomodoroConfig,
  type PomodoroControlState,
  planPomodoroCommand,
  pomodoroCommandSchema,
  projectPomodoro,
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
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cmd = (type: string, revision: number, extra = {}, n = 1) =>
  pomodoroCommandSchema.parse({
    type,
    commandId: id(n),
    expectedRevision: revision,
    ...extra,
  });
const idle: PomodoroControlState = {
  ...IDLE_FIELDS,
  revision: 1,
  lastCommandId: null,
  lastCommandKey: null,
};

function focusing(preparedSessionId = 's1'): PomodoroControlState {
  return {
    ...idle,
    revision: 2,
    phase: 'focus',
    deadlineAt: at(25).toISOString(),
    remainingMs: 25 * 60_000,
    preparedSessionId,
    title: 'Write',
  };
}

function onBreak(deadline: number): PomodoroControlState {
  return {
    ...focusing(),
    phase: 'short_break',
    preparedSessionId: null,
    deadlineAt: at(deadline).toISOString(),
    remainingMs: 5 * 60_000,
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
      replayed: false,
      state: { revision: 2, phase: 'focus', deadlineAt: at(25).toISOString() },
      effects: [{ kind: 'start', title: 'Write', tags: ['pomodoro'] }],
      deadlineAt: at(25).toISOString(),
      serverNow: t0.toISOString(),
    });
  });

  it('rejects a stale revision with the server time', () => {
    expect(
      planPomodoroCommand(idle, cmd('start', 0, { title: 'x' }), t0, config)
    ).toEqual({
      ok: false,
      error: 'revision_conflict',
      serverNow: t0.toISOString(),
    });
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
      deadlineAt: null,
    });
    if (!paused.ok) return;
    const resumed = planPomodoroCommand(
      paused.state,
      cmd('resume', 3, {}, 2),
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
    for (const type of ['pause', 'resume', 'skip']) {
      expect(planPomodoroCommand(idle, cmd(type, 1), t0, config)).toEqual({
        ok: false,
        error: 'invalid_transition',
        serverNow: t0.toISOString(),
      });
    }
  });

  it('stop closes the focus session and goes idle', () => {
    const plan = planPomodoroCommand(focusing(), cmd('stop', 2), at(3), config);
    expect(plan).toMatchObject({
      ok: true,
      state: { phase: 'idle', deadlineAt: null, revision: 3 },
      effects: [{ kind: 'stop', sessionId: 's1', trimToIfAfterStart: null }],
    });
  });

  it('stop while idle changes nothing and keeps the revision', () => {
    const plan = planPomodoroCommand(idle, cmd('stop', 1), t0, config);
    expect(plan).toMatchObject({ ok: true, effects: [], state: idle });
  });

  describe('replay', () => {
    const first = planPomodoroCommand(
      idle,
      cmd('start', 1, { title: 'Write' }),
      t0,
      config
    );
    if (!first.ok) throw new Error('start failed');

    it('returns the stored state for the same id and payload', () => {
      const again = planPomodoroCommand(
        first.state,
        cmd('start', 1, { title: 'Write' }),
        at(1),
        config
      );
      expect(again).toMatchObject({
        ok: true,
        replayed: true,
        effects: [],
        state: first.state,
      });
    });

    it('rejects the same id with a different payload', () => {
      const reused = planPomodoroCommand(
        first.state,
        cmd('start', 1, { title: 'Other' }),
        at(1),
        config
      );
      expect(reused).toMatchObject({ ok: false, error: 'command_conflict' });
    });
  });

  describe('long-break counting', () => {
    it('a skipped focus does not count', () => {
      const third = { ...focusing(), completedFocus: 3 };
      const plan = planPomodoroCommand(third, cmd('skip', 2), at(10), config);
      expect(plan).toMatchObject({
        ok: true,
        state: { phase: 'short_break', completedFocus: 3 },
      });
    });

    it('skipping a break keeps the count', () => {
      const plan = planPomodoroCommand(
        { ...onBreak(30), completedFocus: 2 },
        cmd('skip', 2),
        at(27),
        config
      );
      expect(plan).toMatchObject({
        ok: true,
        state: { phase: 'focus', completedFocus: 2, deadlineAt: null },
        effects: [],
      });
    });

    it('every fourth completed focus earns the long break', () => {
      const fourth = { ...focusing(), completedFocus: 3 };
      const { state } = reconcilePomodoro(fourth, at(25), config);
      expect(state).toMatchObject({
        phase: 'long_break',
        completedFocus: 4,
        remainingMs: 900_000,
      });
    });
  });

  it('a user skip out of a break auto-starts focus when enabled', () => {
    const plan = planPomodoroCommand(onBreak(30), cmd('skip', 2), at(27), auto);
    expect(plan).toMatchObject({
      ok: true,
      state: { phase: 'focus', deadlineAt: at(52).toISOString() },
      effects: [{ kind: 'start', title: 'Write', tags: ['pomodoro'] }],
    });
  });
});

describe('no server path starts focus', () => {
  const starts = (effects: { kind: string }[]) =>
    effects.filter((effect) => effect.kind === 'start');

  it('an on-time break end leaves focus waiting', () => {
    const { state, effects } = reconcilePomodoro(onBreak(30), at(30.5), auto);
    expect(starts(effects)).toEqual([]);
    expect(state).toMatchObject({
      phase: 'focus',
      deadlineAt: null,
      preparedSessionId: null,
    });
  });

  it('a night across many cycles stops once and starts nothing', () => {
    const { state, effects } = reconcilePomodoro(focusing(), at(600), auto);
    expect(effects).toEqual([
      {
        kind: 'stop',
        sessionId: 's1',
        trimToIfAfterStart: at(25).toISOString(),
      },
    ]);
    expect(state).toMatchObject({ phase: 'focus', deadlineAt: null });
  });

  it('the reconcile command and the read projection start nothing', () => {
    const plan = planPomodoroCommand(
      onBreak(30),
      cmd('reconcile', 2),
      at(30.5),
      auto
    );
    expect(plan.ok && starts(plan.effects)).toEqual([]);
    const view = projectPomodoro(onBreak(30), at(30.5), auto);
    expect(view).toMatchObject({
      state: { phase: 'focus', deadlineAt: null },
      deadlineAt: null,
      serverNow: at(30.5).toISOString(),
    });
  });

  it('commands reconcile first without starting focus', () => {
    const command: PomodoroCommand = cmd('pause', 2);
    // The break ended before the pause arrived: focus waits, so a pause
    // has nothing to pause.
    expect(
      planPomodoroCommand(onBreak(30), command, at(31), auto)
    ).toMatchObject({ ok: false, error: 'invalid_transition' });
  });
});

describe('reconcilePomodoro', () => {
  it('leaves a phase whose deadline is still ahead', () => {
    const { state, effects } = reconcilePomodoro(focusing(), at(10), auto);
    expect(effects).toEqual([]);
    expect(state).toEqual(focusing());
  });

  it('an on-time focus end starts the break from now', () => {
    const { state, effects } = reconcilePomodoro(focusing(), at(25.5), auto);
    expect(effects).toEqual([
      { kind: 'stop', sessionId: 's1', trimToIfAfterStart: null },
    ]);
    expect(state).toMatchObject({
      phase: 'short_break',
      completedFocus: 1,
      deadlineAt: at(30.5).toISOString(),
    });
  });
});
