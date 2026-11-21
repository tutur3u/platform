import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  createMeetSnapshotWriteGate,
  getMeetRealtimeScopesForRole,
  isMeetStatelessSfuOutcome,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { MeetCommandExecutor } from './command-executor';
import type { MeetRoomOutcome } from './room';
import {
  applyMediaQualityReport,
  summarizeRoomMediaQuality,
  type MeetMediaQualitySample,
} from './room-media-quality';

const now = '2026-11-21T12:00:00.000Z';
const sample: MeetMediaQualitySample = {
  sendKbps: 800,
  availableSendKbps: 2000,
  recvVideoKbps: 1200,
  rttMs: 40,
  recvLoss: 0.01,
  sendLoss: 0,
  freezes: 1,
  layers: { high: 1, mid: 2, low: 6 },
  sendLayers: 2,
  cpuLimited: false,
  audioOnly: false,
  smallMode: true,
  visibility: 'visible',
  intervalMs: 30_000,
  freezesMeasured: true,
};

function token(n: number, role: 'host' | 'speaker') {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    role,
    exp: Date.parse(now) / 1000 + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'test:quality',
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
  });
}

describe('room media quality', () => {
  it('keeps the latest sample per device and prunes stale ones', () => {
    let quality = applyMediaQualityReport(undefined, 'a', sample, 0);
    quality = applyMediaQualityReport(quality, 'b', sample, 60_000);
    quality = applyMediaQualityReport(
      quality,
      'a',
      { ...sample, sendKbps: 100 },
      60_000
    );
    expect(Object.keys(quality).sort()).toEqual(['a', 'b']);
    expect(quality.a?.sendKbps).toBe(100);
    quality = applyMediaQualityReport(quality, 'c', sample, 200_000);
    expect(Object.keys(quality)).toEqual(['c']);
  });

  it('summarises anonymous distributions and counts', () => {
    let quality = applyMediaQualityReport(undefined, 'a', sample, 0);
    quality = applyMediaQualityReport(
      quality,
      'b',
      { ...sample, sendKbps: 200, cpuLimited: true, visibility: 'background' },
      0
    );
    const summary = summarizeRoomMediaQuality(quality, 1000);
    expect(summary).toMatchObject({
      reporters: 2,
      sendKbps: { p50: 200, p95: 800, max: 800 },
      freezesPerMinute: 2,
      layers: { high: 2, mid: 4, low: 12 },
      cpuLimited: 1,
      hidden: 1,
      smallMode: 2,
    });
    expect(JSON.stringify(summary)).not.toContain('"a"');
  });

  it('rejects out-of-range samples at the schema', () => {
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'media.quality',
        sample: { ...sample, recvLoss: 3 },
      }).success
    ).toBe(false);
  });

  it('stores reports without a durable write and serves summaries to managers only', () => {
    const host = token(1, 'host');
    const speaker = token(2, 'speaker');
    let state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
    state = admitOrHold(state, speaker, now).state;
    const reported = applyMeetRoomCommand(state, {
      token: speaker,
      now,
      message: { type: 'media.quality', sample },
    });
    expect(reported.state.mediaQuality?.[speaker.userId]).toBeDefined();
    expect(isMeetStatelessSfuOutcome(state, reported)).toBe(true);
    const read = (actor: typeof host) =>
      applyMeetRoomCommand(reported.state, {
        token: actor,
        now,
        message: { type: 'media.quality.read', requestId: 'q' },
      }).reply[0];
    expect(read(host)).toMatchObject({
      type: 'media.quality.summary',
      requestId: 'q',
      summary: { reporters: 1 },
    });
    expect(read(speaker)).toMatchObject({
      type: 'error',
      error: 'permission_denied',
    });
  });

  it('never writes the snapshot for a rate-limited refusal', () => {
    const state = createMeetRoomSnapshot();
    let clock = 0;
    const gate = createMeetSnapshotWriteGate(15_000, () => clock);
    const refused = {
      state,
      reply: [
        {
          type: 'error' as const,
          requestId: 'r',
          error: 'layer_update_rate_limited',
        },
      ],
      broadcast: [],
      toManagers: [],
      direct: [],
      disconnect: [],
      sfu: null,
    };
    expect(gate(state, refused)).toBe(true);
    clock = 60_000;
    expect(gate(state, refused)).toBe(true);
  });
});

describe('media quality admission', () => {
  const run = async (
    executor: MeetCommandExecutor,
    actor: ReturnType<typeof token>,
    state: ReturnType<typeof createMeetRoomSnapshot>,
    message: Parameters<MeetCommandExecutor['run']>[0]['message']
  ) => {
    let committed: MeetRoomOutcome | undefined;
    await executor.run(
      { token: actor, now, message },
      {
        read: () => state,
        commit: (result) => void (committed = result),
        runSfu: async () => ({}),
      }
    );
    return committed!;
  };

  it('drops reports beyond the per-minute limit before room processing', async () => {
    const executor = new MeetCommandExecutor();
    const speaker = { ...token(3, 'speaker'), roomId: 'test:quality-limit' };
    const state = admitOrHold(createMeetRoomSnapshot(), speaker, now).state;
    for (let n = 0; n < 4; n++) {
      const accepted = await run(executor, speaker, state, {
        type: 'media.quality',
        sample,
      });
      expect(accepted.state.mediaQuality?.[speaker.userId]).toBeDefined();
    }
    // A dropped report never commits, so it can never reach storage.
    const dropped = await run(executor, speaker, state, {
      type: 'media.quality',
      sample,
    });
    expect(dropped).toBeUndefined();
  });

  it('refuses excess manager reads with a correlated reply and no write', async () => {
    const executor = new MeetCommandExecutor();
    const host = { ...token(4, 'host'), roomId: 'test:quality-read' };
    const state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
    let last: MeetRoomOutcome | undefined;
    for (let n = 0; n <= 10; n++)
      last = await run(executor, host, state, {
        type: 'media.quality.read',
        requestId: `q${n}`,
      });
    expect(last?.reply).toEqual([
      { type: 'error', requestId: 'q10', error: 'media_quality_rate_limited' },
    ]);
    let clock = 60_000;
    const gate = createMeetSnapshotWriteGate(15_000, () => clock);
    expect(gate(state, last!)).toBe(true);
    clock = 120_000;
    expect(gate(state, last!)).toBe(true);
  });

  it('coalesces report writes by interval and persists real changes', () => {
    const host = token(5, 'host');
    const state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
    const report = applyMeetRoomCommand(state, {
      token: host,
      now,
      message: { type: 'media.quality', sample },
    });
    let clock = 0;
    const gate = createMeetSnapshotWriteGate(15_000, () => clock);
    expect(gate(state, report)).toBe(false);
    clock = 5000;
    expect(gate(state, report)).toBe(true);
    clock = 20_000;
    expect(gate(state, report)).toBe(false);
    const settled = {
      ...report,
      state: { ...report.state, classTimer: null },
    };
    clock = 21_000;
    expect(isMeetStatelessSfuOutcome(state, settled)).toBe(false);
    expect(gate(state, settled)).toBe(false);
    const denied = applyMeetRoomCommand(state, {
      token: token(6, 'speaker'),
      now,
      message: { type: 'media.quality.read', requestId: 'r' },
    });
    expect(isMeetStatelessSfuOutcome(state, denied)).toBe(true);
  });
});

describe('freeze rate coverage', () => {
  it('divides freezes only by devices that measured cameras', () => {
    let quality = applyMediaQualityReport(
      undefined,
      'a',
      { ...sample, freezes: 3 },
      0
    );
    quality = applyMediaQualityReport(
      quality,
      'b',
      { ...sample, freezes: 0, recvVideoKbps: null },
      0
    );
    // Receives video but its browser reports no freeze counter.
    quality = applyMediaQualityReport(
      quality,
      'c',
      { ...sample, freezes: 0, freezesMeasured: false },
      0
    );
    const summary = summarizeRoomMediaQuality(quality, 1000);
    expect(summary.reporters).toBe(3);
    expect(summary.cameraReporters).toBe(2);
    expect(summary.freezeReporters).toBe(1);
    expect(summary.freezesPerMinute).toBe(6);
  });
});
