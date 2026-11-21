import { describe, expect, it, vi } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  canCloseMeetSubscriptions,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  createMeetSnapshotWriteGate,
  isMeetStatelessSfuOutcome,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  advertisedCameraRids,
  negotiableCameraRids,
  publishedCameraRids,
  layerForRid,
  ridForLayer,
  simulcastPreference,
} from './simulcast-layers';
import {
  MEET_LAYER_UPDATES_PER_MINUTE,
  MeetCommandExecutor,
} from './command-executor';
import { CloudflareSfuClient } from './sfu';

const now = '2026-11-21T12:00:00.000Z';
const sdp = (rids: string[]) =>
  [
    'v=0',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=mid:0',
    ...rids.map((rid) => `a=rid:${rid} send`),
    `a=simulcast:send ${rids.join(';')}`,
    '',
  ].join('\r\n');

function token(role: 'host' | 'speaker' | 'viewer') {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: '00000000-0000-4000-8000-000000000002',
    role,
    exp: Date.parse(now) / 1000 + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'test:layers',
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
  });
}

describe('simulcast RID schemes', () => {
  it('orders the current scheme so ASCII fallback steps down one layer', () => {
    const rids = advertisedCameraRids(sdp(['f', 'h', 'q']));
    expect(rids).toEqual(['f', 'h', 'q']);
    expect([...rids].sort()).toEqual(rids);
    expect(ridForLayer(rids, 'high')).toBe('f');
    expect(ridForLayer(rids, 'mid')).toBe('h');
    expect(ridForLayer(rids, 'low')).toBe('q');
    expect(layerForRid(rids, 'h')).toBe('mid');
  });

  it('keeps legacy h/m/l publishers addressable by semantic layer', () => {
    const rids = advertisedCameraRids(sdp(['h', 'm', 'l']));
    expect(rids).toEqual(['h', 'm', 'l']);
    expect(ridForLayer(rids, 'high')).toBe('h');
    expect(ridForLayer(rids, 'low')).toBe('l');
    expect(layerForRid(rids, 'h')).toBe('high');
  });

  it('requests nothing for a publisher without simulcast or the wanted layer', () => {
    expect(advertisedCameraRids(sdp(['h']))).toEqual(['h']);
    expect(simulcastPreference(['h'], 'high')).toBeNull();
    expect(simulcastPreference(undefined, 'low')).toBeNull();
    expect(simulcastPreference(['f', 'h'], 'low')).toBeNull();
  });

  it('only negotiates ASCII RIDs with a room server that advertises them', () => {
    expect(negotiableCameraRids(['f', 'h', 'q'], [])).toBeUndefined();
    expect(negotiableCameraRids(['h', 'm', 'l'], [])).toEqual(['h', 'm', 'l']);
    expect(negotiableCameraRids(['f', 'h', 'q'], ['ascii-simulcast'])).toEqual([
      'f',
      'h',
      'q',
    ]);
    expect(publishedCameraRids(undefined)).toEqual(['h', 'm', 'l']);
    expect(publishedCameraRids(['ascii-simulcast'])).toEqual(['f', 'h', 'q']);
  });

  it('records current-scheme RIDs from a publish offer', () => {
    const actor = token('host');
    const state = admitOrHold(createMeetRoomSnapshot(), actor, now).state;
    const result = applyMeetRoomCommand(state, {
      token: actor,
      now,
      message: {
        type: 'sfu.tracks.publish',
        requestId: 'pub',
        sessionId: 'pub-session',
        sessionDescription: { type: 'offer', sdp: sdp(['f', 'h', 'q']) },
        tracks: [{ mid: '0', trackName: `${actor.userId}-video` }],
      },
    });
    expect(Object.values(result.state.tracks)[0]?.cameraRids).toEqual([
      'f',
      'h',
      'q',
    ]);
  });
});

describe('sfu.tracks.update', () => {
  const viewer = token('viewer');
  const admitted = admitOrHold(createMeetRoomSnapshot(), viewer, now).state;
  const camera = {
    sessionId: 'publisher',
    trackName: 'someone-video',
    userId: 'someone',
    kind: 'video',
    cameraRids: ['f', 'h', 'q'] as Array<'f' | 'h' | 'q'>,
  };
  const state = {
    ...admitted,
    tracks: { 'publisher:someone-video': camera },
  };
  const parsed = meetRealtimeClientMessageSchema.parse({
    type: 'sfu.tracks.update',
    requestId: 'layer',
    sessionId: 'receiver',
    tracks: [
      {
        mid: '7',
        sessionId: 'publisher',
        trackName: 'someone-video',
        location: 'remote',
        kind: 'video',
        simulcast: {
          preferredRid: 'q',
          priorityOrdering: 'asciibetical',
          ridNotAvailable: 'asciibetical',
        },
      },
    ],
  });
  if (parsed.type !== 'sfu.tracks.update') throw new Error('schema');
  const message = parsed;
  const attempt = (mids: string[], actor = viewer) =>
    applyMeetRoomCommand(state, {
      token: actor,
      now,
      message,
      canCloseSubscriptions: () =>
        canCloseMeetSubscriptions({ receiver: mids }, message),
    });

  it('forwards a layer change for an owned receiver without changing room state', () => {
    const result = attempt(['7']);
    expect(result.state).toBe(state);
    expect(result.broadcast).toEqual([]);
    expect(result.sfu?.message).toEqual({
      ...message,
      tracks: [
        {
          location: 'remote',
          mid: '7',
          sessionId: 'publisher',
          trackName: 'someone-video',
          simulcast: {
            preferredRid: 'q',
            priorityOrdering: 'asciibetical',
            ridNotAvailable: 'asciibetical',
          },
        },
      ],
    });
  });

  it('refuses receivers the socket did not subscribe', () => {
    expect(attempt(['8']).reply).toContainEqual({
      type: 'error',
      requestId: 'layer',
      error: 'permission_denied',
    });
    expect(attempt(['8']).sfu).toBeNull();
  });

  it('refuses a RID or publication the room does not advertise', () => {
    const track = message.tracks[0]!;
    for (const variant of [
      {
        ...track,
        simulcast: { ...track.simulcast!, preferredRid: 'm' as const },
      },
      { ...track, trackName: 'someone-screen' },
      { ...track, sessionId: 'elsewhere' },
    ]) {
      const changed = { ...message, tracks: [variant] };
      const result = applyMeetRoomCommand(state, {
        token: viewer,
        now,
        message: changed,
        canCloseSubscriptions: () =>
          canCloseMeetSubscriptions({ receiver: ['7'] }, changed),
      });
      expect(result.sfu).toBeNull();
    }
  });

  it('refuses an update without a simulcast preference', () => {
    const bare = {
      ...message,
      tracks: [{ ...message.tracks[0], simulcast: undefined }],
    };
    const result = applyMeetRoomCommand(state, {
      token: viewer,
      now,
      message: bare,
      canCloseSubscriptions: () =>
        canCloseMeetSubscriptions({ receiver: ['7'] }, bare),
    });
    expect(result.sfu).toBeNull();
  });

  it('rejects unknown RIDs and oversized batches at the schema', () => {
    const track = message.tracks[0]!;
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        ...message,
        tracks: [
          { ...track, simulcast: { ...track.simulcast, preferredRid: 'x' } },
        ],
      }).success
    ).toBe(false);
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        ...message,
        tracks: Array.from({ length: 65 }, () => track),
      }).success
    ).toBe(false);
  });

  it('skips the durable snapshot write only for a confirmed layer switch', () => {
    const reply = {
      type: 'sfu.response' as const,
      action: 'sfu.tracks.update' as const,
      requestId: 'layer',
      result: {},
    };
    const base = {
      state,
      reply: [reply],
      broadcast: [],
      toManagers: [],
      direct: [],
      disconnect: [],
      sfu: null,
    };
    expect(isMeetStatelessSfuOutcome(state, base)).toBe(true);
    // Time accounting alone keeps the outcome stateless.
    expect(
      isMeetStatelessSfuOutcome(state, { ...base, state: { ...state } })
    ).toBe(true);
    expect(
      isMeetStatelessSfuOutcome(state, {
        ...base,
        state: { ...state, tracks: {} },
      })
    ).toBe(false);
    let clock = 0;
    const gate = createMeetSnapshotWriteGate(15_000, () => clock);
    expect(gate(state, base)).toBe(false);
    clock = 5_000;
    expect(gate(state, base)).toBe(true);
    clock = 16_000;
    expect(gate(state, base)).toBe(false);
    expect(
      isMeetStatelessSfuOutcome(state, {
        ...base,
        reply: [{ ...reply, action: 'sfu.tracks.subscribe' as const }],
      })
    ).toBe(false);
  });

  it('calls the Connection API track update path', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ tracks: [] })
    );
    const client = new CloudflareSfuClient({
      appId: 'app-1',
      appSecret: 'secret-1',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.updateTracks({
      sessionId: 'receiver',
      tracks: [{ mid: '7', location: 'remote' }],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/receiver/tracks/update'
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
  });
});

describe('layer update admission', () => {
  it('rate-limits a receiver once per request without touching the SFU', async () => {
    const executor = new MeetCommandExecutor();
    const actor = {
      ...token('viewer'),
      userId: '00000000-0000-4000-8000-000000000009',
      roomId: 'test:rate',
    };
    const state = admitOrHold(createMeetRoomSnapshot(), actor, now).state;
    const commits: unknown[] = [];
    const runSfu = vi.fn(async () => ({ tracks: [] }));
    const message = {
      type: 'sfu.tracks.update' as const,
      requestId: 'r',
      sessionId: 'receiver',
      tracks: [{ mid: '1' }],
    };
    for (let n = 0; n <= MEET_LAYER_UPDATES_PER_MINUTE; n++)
      await executor.run(
        { token: actor, now, message, canCloseSubscriptions: () => false },
        { read: () => state, commit: (r) => void commits.push(r), runSfu }
      );
    const last = commits.at(-1) as Parameters<
      typeof isMeetStatelessSfuOutcome
    >[1];
    expect(last.reply).toEqual([
      { type: 'error', requestId: 'r', error: 'layer_update_rate_limited' },
    ]);
    expect(isMeetStatelessSfuOutcome(state, last)).toBe(true);
    expect(runSfu).not.toHaveBeenCalled();
  });

  it('persists a layer outcome that also sealed attendance', () => {
    const viewer = token('viewer');
    const state = admitOrHold(createMeetRoomSnapshot(), viewer, now).state;
    const result = {
      state: { ...state, attendance: [] },
      reply: [
        {
          type: 'sfu.response' as const,
          action: 'sfu.tracks.update' as const,
          result: {},
        },
      ],
      broadcast: [],
      toManagers: [],
      direct: [],
      disconnect: [],
      sfu: null,
    };
    expect(isMeetStatelessSfuOutcome(state, result)).toBe(false);
  });
});
