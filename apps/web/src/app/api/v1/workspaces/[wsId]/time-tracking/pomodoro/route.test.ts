import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS = '00000000-0000-4000-8000-000000000a01';
const USER = '00000000-0000-4000-8000-000000000b01';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Row = Record<string, unknown> & { revision: number };
type Call = { name: string; args: Record<string, unknown> };

const db = vi.hoisted(() => ({
  row: null as Row | null,
  calls: [] as Call[],
  receipts: new Map<string, Row>(),
  error: null as { code: string; message: string } | null,
  published: [] as { topic: string; revision: unknown }[],
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (...args: unknown[]) => Promise<Response>) =>
    async (request: NextRequest, context?: { params?: Promise<unknown> }) =>
      handler(
        request,
        { user: { id: USER }, supabase: {} },
        await context?.params
      ),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async (wsId: string) => wsId,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

vi.mock('@tuturuuu/realtime/channels/server', () => ({
  publishChannelBroadcast: async (
    topic: string,
    message: { payload: { revision: unknown } }
  ) => {
    db.published.push({ topic, revision: message.payload.revision });
  },
}));

const config = {
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  sessions_until_long_break: 4,
  auto_start_breaks: true,
  auto_start_focus: true,
};

// A fake of the private functions: it applies the planned state as given.
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        db.calls.push({ name, args });
        if (name === 'read_time_tracker_control') {
          return { data: db.row, error: null };
        }
        if (name === 'configure_time_tracker_control') {
          db.row = {
            revision: 1,
            mode: 'off',
            phase: 'idle',
            deadline_at: null,
            prepared_session_id: null,
            config: args.p_config,
          };
          return { data: db.row, error: null };
        }
        if (db.error) return { data: null, error: db.error };
        const receipt = db.receipts.get(args.p_command_id as string);
        if (receipt)
          return { data: { ...receipt, replayed: true }, error: null };
        if (args.p_expected_revision !== db.row?.revision) {
          return {
            data: null,
            error: { code: '40001', message: 'Pomodoro revision conflict' },
          };
        }
        const next = args.p_next as Record<string, unknown>;
        const effects = args.p_effects as { kind: string }[];
        db.row = {
          ...db.row,
          revision: (db.row?.revision ?? 0) + 1,
          mode: next.phase === 'idle' ? 'off' : 'pomodoro',
          phase: next.phase,
          deadline_at: next.deadlineAt,
          remaining_ms: next.remainingMs,
          completed_focus: next.completedFocus,
          title: next.title,
          prepared_session_id:
            next.phase === 'focus' && effects.some((e) => e.kind === 'start')
              ? id(900)
              : null,
        };
        db.receipts.set(args.p_command_id as string, db.row);
        return { data: { ...db.row, replayed: false }, error: null };
      },
    }),
  }),
}));

const { GET, POST } = await import('./route');

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const params = { params: Promise.resolve({ wsId: WS }) };
const url = `http://localhost/api/v1/workspaces/${WS}/time-tracking/pomodoro`;
const post = (body: unknown) =>
  POST(
    new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }),
    params
  );
const commandCalls = () =>
  db.calls.filter((call) => call.name === 'command_time_tracker_pomodoro');
const effectsOf = (call: Call | undefined) =>
  (call?.args.p_effects ?? []) as { kind: string }[];

function breakEnded(): Row {
  return {
    revision: 5,
    mode: 'pomodoro',
    phase: 'short_break',
    deadline_at: minutesAgo(1),
    remaining_ms: 300_000,
    completed_focus: 1,
    prepared_session_id: null,
    task_id: null,
    title: 'Write',
    config,
  };
}

beforeEach(() => {
  db.row = null;
  db.calls = [];
  db.receipts.clear();
  db.error = null;
  db.published = [];
});

describe('Pomodoro route: no server path starts focus', () => {
  it('GET projects a break that ended into waiting focus and writes nothing', async () => {
    db.row = breakEnded();
    const response = await GET(new NextRequest(url), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toMatchObject({ phase: 'focus', sessionId: null });
    expect(body.deadlineAt).toBeNull();
    expect(typeof body.serverNow).toBe('string');
    expect(db.calls.map((call) => call.name)).toEqual([
      'read_time_tracker_control',
    ]);
  });

  it('a reconcile command persists the waiting focus without a start effect', async () => {
    db.row = breakEnded();
    const response = await post({
      type: 'reconcile',
      commandId: id(1),
      expectedRevision: 5,
    });

    expect(response.status).toBe(200);
    const [call] = commandCalls();
    expect(effectsOf(call).map((effect) => effect.kind)).not.toContain('start');
    expect(call?.args.p_next).toMatchObject({
      phase: 'focus',
      deadlineAt: null,
    });
    expect(db.published).toEqual([
      { topic: `time-tracker-pomodoro-${WS}-${USER}`, revision: 6 },
    ]);
  });

  it('a command after a night of missed phases stops once and starts nothing', async () => {
    db.row = {
      ...breakEnded(),
      phase: 'focus',
      deadline_at: minutesAgo(600),
      prepared_session_id: id(700),
    };
    const response = await post({
      type: 'pause',
      commandId: id(2),
      expectedRevision: 5,
    });

    // Focus waits after the night, so there is nothing to pause.
    expect(response.status).toBe(422);
    expect(commandCalls()).toEqual([]);

    await post({ type: 'reconcile', commandId: id(3), expectedRevision: 5 });
    expect(effectsOf(commandCalls()[0])).toEqual([
      expect.objectContaining({ kind: 'stop', sessionId: id(700) }),
    ]);
  });
});

describe('Pomodoro route commands', () => {
  it('start creates the control and a tagged focus session', async () => {
    const response = await post({
      type: 'start',
      commandId: id(4),
      expectedRevision: 0,
      title: 'Write',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(db.calls.map((call) => call.name)).toEqual([
      'read_time_tracker_control',
      'configure_time_tracker_control',
      'command_time_tracker_pomodoro',
    ]);
    expect(effectsOf(commandCalls()[0])).toEqual([
      expect.objectContaining({ kind: 'start', tags: ['pomodoro'] }),
    ]);
    expect(body.state).toMatchObject({ phase: 'focus', sessionId: id(900) });
  });

  it('stop without a control writes nothing', async () => {
    const response = await post({
      type: 'stop',
      commandId: id(5),
      expectedRevision: 0,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).state.phase).toBe('idle');
    expect(db.calls.map((call) => call.name)).toEqual([
      'read_time_tracker_control',
    ]);
  });

  it('a retry with the old revision replays from the receipt', async () => {
    db.row = breakEnded();
    const command = { type: 'skip', commandId: id(6), expectedRevision: 5 };
    await post(command);
    const retry = await post(command);
    const body = await retry.json();

    expect(retry.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(effectsOf(commandCalls()[1])).toEqual([]);
    expect(db.published).toHaveLength(1);
  });

  it('a stale revision is a 409 with the current state', async () => {
    db.row = breakEnded();
    const response = await post({
      type: 'skip',
      commandId: id(7),
      expectedRevision: 4,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: 'revision_conflict',
      state: { revision: 5 },
    });
  });

  it('a stale revision 0 against an existing control is a 409', async () => {
    db.row = { ...breakEnded(), revision: 1, phase: 'idle', mode: 'off' };
    const response = await post({
      type: 'start',
      commandId: id(9),
      expectedRevision: 0,
      title: 'Write',
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('revision_conflict');
    expect(commandCalls()).toEqual([]);
    expect(db.calls.map((call) => call.name)).not.toContain(
      'configure_time_tracker_control'
    );
  });

  it('a running manual timer is a 409 the client can explain', async () => {
    db.row = { ...breakEnded(), phase: 'idle', mode: 'off' };
    db.error = { code: '40001', message: 'Timer running session conflict' };
    const response = await post({
      type: 'start',
      commandId: id(8),
      expectedRevision: 5,
      title: 'Write',
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('timer_running');
  });

  it('rejects a malformed command', async () => {
    const response = await post({ type: 'wake', commandId: 'x' });
    expect(response.status).toBe(400);
    expect(db.calls).toEqual([]);
  });
});
