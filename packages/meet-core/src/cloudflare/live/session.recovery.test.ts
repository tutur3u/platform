import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LIVE_JOURNAL } from '../../features/live-assistant/context';
import { signLiveSession } from '../../features/live-assistant/token';
import { MeetLiveDurableObject } from './session';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

const mocks = vi.hoisted(() => ({
  room: vi.fn(),
  connect: vi.fn(),
  finalize: vi.fn(),
}));
vi.mock('./room', () => ({ liveRoomCommand: mocks.room }));
vi.mock('./provider', () => ({
  connectLiveProvider: mocks.connect,
  drainLiveProvider: vi.fn(),
}));
vi.mock('./billing', () => ({ beginLiveBilling: vi.fn(async () => ({})) }));
vi.mock('./usage-report', () => ({ reportLiveUsage: vi.fn() }));
vi.mock('./session-cleanup', () => ({ cleanupEndedLiveSession: vi.fn() }));
vi.mock('./finalize-billing', () => ({
  finalizeSessionBilling: mocks.finalize,
  settlePublicBillings: vi.fn(),
}));

const origin = 'https://meet.example.test';
const env = {
  MEET_AI_DISABLED: 'false',
  MEET_REALTIME_TOKEN_SECRET: 'synthetic-test-secret',
  NEXT_PUBLIC_APP_URL: origin,
} as LiveEnvironment;
let now: number;
let sockets: TestSocket[];
class TestSocket extends EventTarget {
  static OPEN = 1;
  readyState = 1;
  accept = vi.fn();
  send = vi.fn();
  close = vi.fn();
  disconnect(code = 1006) {
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
}
function fixture(): SavedSession {
  return {
    claims: {
      audience: 'meet-live',
      sessionId: '00000000-0000-4000-8000-000000000001',
      ownerId: '00000000-0000-4000-8000-000000000002',
      meetingId: '00000000-0000-4000-8000-000000000003',
      billingWorkspaceId: '00000000-0000-4000-8000-000000000004',
      mode: 'personal',
      inputSource: 'private-microphone',
      workspaceAuthority: 'verified-personal',
      consentVersion: 'synthetic-v1',
      consentRevision: 1,
      expiresAt: now + 3600_000,
    },
    identity: {
      workspaceId: 'synthetic-workspace',
    } as SavedSession['identity'],
    timezone: 'UTC',
    sharedContext: '',
    journal: structuredClone(EMPTY_LIVE_JOURNAL),
    reviews: [],
    startedAt: now - 60_000,
  };
}
function continueChoice(saved: SavedSession) {
  return {
    choice: 'continue',
    accountId: saved.claims.ownerId,
    meetingId: saved.claims.meetingId,
    version: saved.claims.consentVersion,
    revision: saved.claims.consentRevision,
  };
}
function harness(saved = fixture()) {
  const data = new Map<string, unknown>([['session', structuredClone(saved)]]);
  const storage = {
    list: vi.fn(async () => new Map()),
    get: vi.fn(async (key: string) => structuredClone(data.get(key))),
    put: vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    }),
    setAlarm: vi.fn(async (_deadline: number) => {}),
  };
  const pending: Promise<unknown>[] = [];
  let ready: Promise<unknown>;
  const state = {
    storage,
    blockConcurrencyWhile: (run: () => Promise<unknown>) => {
      ready = run();
    },
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  } as unknown as DurableObjectState;
  const construct = async () => {
    const object = new MeetLiveDurableObject(state, env);
    await ready;
    return object;
  };
  return {
    construct,
    storage,
    saved: () => data.get('session') as SavedSession,
    drain: async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    },
  };
}
function reconnect(object: MeetLiveDurableObject, saved: SavedSession) {
  return object.fetch(
    new Request(`${origin}/socket`, {
      headers: {
        Origin: origin,
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `meet-live, auth.${signLiveSession(saved.claims, env.MEET_REALTIME_TOKEN_SECRET)}`,
      },
    })
  );
}
beforeEach(() => {
  now = 1_800_000_000_000;
  sockets = [];
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  mocks.room.mockReset();
  mocks.connect.mockReset().mockResolvedValue({
    close: vi.fn(),
    sendRealtimeInput: vi.fn(),
  });
  mocks.finalize.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('WebSocket', TestSocket);
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = new TestSocket();
      1 = new TestSocket();
      constructor() {
        sockets.push(this[1]);
      }
    }
  );
  const NativeResponse = Response;
  vi.stubGlobal(
    'Response',
    class extends NativeResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init?.status === 101 ? { status: 200 } : init);
        if (init?.status === 101)
          Object.defineProperty(this, 'status', { value: 101 });
      }
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('durable disconnected recovery', () => {
  it('reconstructs a live session and preserves its cutoff across resets and early alarms', async () => {
    const h = harness();
    let object = await h.construct();
    const deadline = now + 30_000;
    expect(h.saved().disconnectedRecoveryDeadline).toBe(deadline);
    now += 10_000;
    object = await h.construct();
    await object.alarm();
    expect(h.saved().ended).not.toBe(true);
    expect(h.saved().disconnectedRecoveryDeadline).toBe(deadline);
    expect(h.storage.setAlarm).toHaveBeenLastCalledWith(deadline);
    expect(mocks.connect).not.toHaveBeenCalled();
    now = deadline;
    await object.alarm();
    await h.drain();
    expect(h.saved().ended).toBe(true);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    const writes = h.storage.put.mock.calls.length;
    await (await h.construct()).alarm();
    expect(h.saved().disconnectedRecoveryDeadline).toBe(deadline);
    expect(h.storage.put.mock.calls.length).toBe(writes);
  });

  it('survives an alarm before reconnect, then persists a fresh cutoff on abnormal close', async () => {
    const h = harness();
    const object = await h.construct();
    mocks.room.mockResolvedValue({ choice: continueChoice(h.saved()) });
    now += 1000;
    await object.alarm();
    expect((await reconnect(object, h.saved())).status).toBe(101);
    await h.drain();
    expect(h.saved().disconnectedRecoveryDeadline).toBeUndefined();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    sockets[0]!.disconnect();
    await h.drain();
    const deadline = now + 30_000;
    expect(h.saved().disconnectedRecoveryDeadline).toBe(deadline);
    now += 1000;
    const reset = await h.construct();
    await reset.alarm();
    expect(h.saved().ended).not.toBe(true);
    expect(h.storage.setAlarm).toHaveBeenLastCalledWith(deadline);
    now = deadline;
    await reset.alarm();
    expect(h.saved().ended).toBe(true);
  });

  it.each(['missing', 'mute', 'revision', 'owner', 'meeting', 'version'])(
    'requires the server-recorded continue on resume: %s',
    async (change) => {
      const h = harness();
      const object = await h.construct();
      const choice = continueChoice(h.saved());
      if (change === 'mute') choice.choice = 'mute';
      if (change === 'revision') choice.revision = 2;
      if (change === 'owner') choice.accountId = 'other';
      if (change === 'meeting') choice.meetingId = 'other';
      if (change === 'version') choice.version = 'other';
      mocks.room.mockResolvedValue({
        choice: change === 'missing' ? null : choice,
      });
      await expect(reconnect(object, h.saved())).rejects.toThrow(
        'Private Mira choice is unavailable'
      );
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(sockets).toHaveLength(0);
      expect(h.saved().disconnectedRecoveryDeadline).toBe(now + 30_000);
    }
  );

  it('keeps the eligibility kill switch on resume', async () => {
    const h = harness();
    const object = await h.construct();
    env.MEET_AI_DISABLED = 'true';
    try {
      expect((await reconnect(object, h.saved())).status).toBe(403);
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.room).not.toHaveBeenCalled();
    } finally {
      env.MEET_AI_DISABLED = 'false';
    }
  });

  it('ends immediately on an intentional close', async () => {
    const h = harness();
    const object = await h.construct();
    mocks.room.mockResolvedValue({ choice: continueChoice(h.saved()) });
    await reconnect(object, h.saved());
    await h.drain();
    sockets[0]!.disconnect(1000);
    await h.drain();
    expect(h.saved().ended).toBe(true);
  });
});
