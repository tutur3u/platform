import assert from 'node:assert/strict';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';

export const BASE_CLOCK = Date.parse('2026-11-28T08:00:00Z');

export const alarmTestToken = meetRealtimeTokenPayloadSchema.parse({
  exp: Math.floor(Date.now() / 1000) + 600,
  limits: {},
  meetingApp: 'meet',
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'host',
  roomId: 'workspace:meeting',
  scopes: [...getMeetRealtimeScopesForRole('host'), 'meet:server'],
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});

export function mediaCleanupFixture(options: {
  env?: Partial<MeetRoomEnv>;
  cleanupAttempts?: number;
  nextCleanupAt?: number;
  expiresAt?: number;
  ended?: boolean;
  tracks?: Record<
    string,
    { sessionId: string; userId: string; trackName: string; mid: string }
  >;
}) {
  let clock = BASE_CLOCK;
  const OriginalDate = Date;
  const OriginalResponse = globalThis.Response;
  const OriginalWebSocketPair = (globalThis as { WebSocketPair?: unknown })
    .WebSocketPair;
  const sockets: WebSocket[] = [];
  let joining: WebSocket | undefined;
  globalThis.Date = class extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? clock);
    }
    static override now() {
      return clock;
    }
  } as unknown as DateConstructor;
  Object.assign(globalThis, {
    Response: class extends OriginalResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      }
    },
    WebSocketPair: class {
      0 = {};
      1 = joining;
    },
  });

  const base = admitOrHold(
    createMeetRoomSnapshot(),
    alarmTestToken,
    new Date(clock).toISOString()
  ).state;
  const snapshot = {
    ...base,
    ended: options.ended ?? true,
    presence: options.ended === false ? base.presence : {},
    tracks: options.tracks ?? {},
    lifecycle: { version: 1, hadConnection: true },
    budget: {
      expiresAt:
        options.expiresAt ??
        (options.ended === false ? clock + 3_600_000 : clock),
      accountedAt: clock,
      participantMilliseconds: 0,
      maxPublishers: 10,
      maxViewers: 10,
      pendingPublications: [
        {
          sessionId: 'sfu-session-1',
          userId: alarmTestToken.userId,
          trackName: 'audio',
          mid: '0',
        },
      ],
      cleanupAttempts: options.cleanupAttempts,
      nextCleanupAt: options.nextCleanupAt ?? 0,
    },
  };
  const values = new Map<string, unknown>([['snapshot', snapshot]]);
  let alarm: number | null = null;
  const alarms: number[] = [];
  let writes = 0;
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      if (key === 'snapshot') writes++;
      values.set(key, structuredClone(value));
    },
    getAlarm: async () => alarm,
    setAlarm: async (at: number) => {
      if (!(at > 0))
        throw new TypeError(
          'setAlarm() cannot be called with an alarm time <= 0'
        );
      alarms.push(at);
      alarm = at;
    },
  };
  let env: MeetRoomEnv = {
    CLOUDFLARE_REALTIME_APP_ID: 'app',
    CLOUDFLARE_REALTIME_APP_SECRET: 'secret',
    ...options.env,
  } as MeetRoomEnv;
  const makeRoom = () =>
    new MeetRoomDurableObject(
      {
        storage,
        setWebSocketAutoResponse: () => {},
        getWebSockets: () => sockets,
        acceptWebSocket: (socket: WebSocket) => {
          sockets.push(socket);
        },
        waitUntil: () => {},
        blockConcurrencyWhile: (run: () => Promise<void>) => run(),
      } as unknown as DurableObjectState,
      env
    );
  let room = makeRoom();
  const warnings: unknown[][] = [];
  const errors: unknown[][] = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args: unknown[]) => warnings.push(args);
  console.error = (...args: unknown[]) => errors.push(args);

  return {
    get room() {
      return room;
    },
    async join(joinToken = alarmTestToken) {
      let attachment: unknown = { token: joinToken };
      const socket = {
        readyState: WebSocket.OPEN as number,
        send: () => undefined,
        close: () => undefined,
        serializeAttachment: (value: unknown) => {
          attachment = value;
        },
        deserializeAttachment: () => attachment,
      } as unknown as WebSocket;
      joining = socket;
      await room.fetch(
        new Request('https://room.example/realtime', {
          headers: {
            'x-meet-token': JSON.stringify(joinToken),
            Upgrade: 'websocket',
          },
        })
      );
      return socket;
    },
    setEnv(next: Partial<MeetRoomEnv>) {
      env = { ...env, ...next };
      room = makeRoom();
    },
    restart() {
      room = makeRoom();
      return room;
    },
    setSfu(client: {
      closeTracks: (input: unknown) => Promise<unknown>;
      getSession: (sessionId: string) => Promise<unknown>;
    }) {
      (room as unknown as { sfuClient: () => unknown }).sfuClient = () =>
        client;
    },
    advanceToAlarm() {
      assert.ok(alarm !== null, 'expected an armed alarm');
      clock = alarm;
      alarm = null;
    },
    setClock(next: number) {
      clock = next;
    },
    currentAlarm: () => alarm,
    alarms,
    writes: () => writes,
    warnings,
    errors,
    snapshot: () =>
      values.get('snapshot') as {
        ended?: boolean;
        budget?: {
          pendingPublications?: unknown[];
          cleanupAttempts?: number;
          cleanupStopped?: boolean;
          nextCleanupAt?: number;
        };
      },
    restore() {
      globalThis.Date = OriginalDate;
      globalThis.Response = OriginalResponse;
      (globalThis as { WebSocketPair?: unknown }).WebSocketPair =
        OriginalWebSocketPair;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}
