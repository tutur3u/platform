import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
  summarizeRoomMediaQuality,
} from './index';
import type { MeetMediaQualitySample } from './room-media-quality';
import {
  exceedsMeetStreamEntitlement,
  MEET_STREAM_TIERS,
  meetStreamEntitlement,
  meetStreamTierForProduct,
  resolveMeetStreamEntitlement,
} from './stream-tiers';
import { signMeetRealtimeToken, verifyMeetRealtimeToken } from './token';

const now = '2026-11-22T08:00:00.000Z';
const secret = 'test-secret-with-enough-length-0123456789';

function payload(tier?: 'free' | 'paid') {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: '00000000-0000-4000-8000-000000000031',
    role: 'speaker',
    exp: Math.floor(Date.parse(now) / 1000) + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'test:streams',
    limits: tier ? { stream: meetStreamEntitlement(tier) } : {},
    scopes: getMeetRealtimeScopesForRole('speaker'),
  });
}

describe('stream tiers', () => {
  it('keeps free at HD with a low frame rate and unlocks more on paid plans', () => {
    expect(MEET_STREAM_TIERS.free.screen).toMatchObject({
      maxHeight: 720,
      maxFrameRate: 15,
    });
    expect(MEET_STREAM_TIERS.paid.screen.maxHeight).toBe(1440);
    expect(MEET_STREAM_TIERS.paid.screen.maxFrameRate).toBe(60);
    expect(MEET_STREAM_TIERS.paid.camera).toMatchObject({
      maxHeight: 1080,
      maxFrameRate: 30,
    });
    for (const kind of ['camera', 'screen'] as const)
      expect(MEET_STREAM_TIERS.paid[kind].maxBitrateKbps).toBeGreaterThan(
        MEET_STREAM_TIERS.free[kind].maxBitrateKbps
      );
  });

  it('maps workspace products to tiers and defaults to free', () => {
    expect(meetStreamTierForProduct('FREE')).toBe('free');
    expect(meetStreamTierForProduct(undefined)).toBe('free');
    for (const tier of ['PLUS', 'PRO', 'ENTERPRISE'])
      expect(meetStreamTierForProduct(tier)).toBe('paid');
    expect(resolveMeetStreamEntitlement(undefined).tier).toBe('free');
  });

  it('refuses a token whose stream claim was raised after signing', () => {
    const signed = signMeetRealtimeToken(payload('free'), secret);
    const [body, signature] = signed.split('.');
    const decoded = JSON.parse(
      Buffer.from(body!, 'base64url').toString('utf8')
    );
    decoded.limits.stream = meetStreamEntitlement('paid');
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`;
    expect(verifyMeetRealtimeToken(tampered, secret)).toBeNull();
    expect(verifyMeetRealtimeToken(signed, secret)?.limits.stream?.tier).toBe(
      'free'
    );
  });

  it('flags reported dimensions beyond the entitlement with tolerance', () => {
    const free = meetStreamEntitlement('free');
    expect(
      exceedsMeetStreamEntitlement({ screenHeight: 720, screenFps: 15 }, free)
    ).toBe(false);
    expect(exceedsMeetStreamEntitlement({ screenFps: 17 }, free)).toBe(false);
    expect(exceedsMeetStreamEntitlement({ screenHeight: 1080 }, free)).toBe(
      true
    );
    expect(exceedsMeetStreamEntitlement({ cameraFps: 30 }, free)).toBe(true);
    expect(
      exceedsMeetStreamEntitlement(
        { screenHeight: 1440, screenFps: 60 },
        meetStreamEntitlement('paid')
      )
    ).toBe(false);
  });
});

describe('room enforcement', () => {
  const sample: MeetMediaQualitySample = {
    sendKbps: 2000,
    availableSendKbps: null,
    recvVideoKbps: null,
    rttMs: 30,
    recvLoss: null,
    sendLoss: null,
    freezes: 0,
    layers: { high: 0, mid: 0, low: 0 },
    sendLayers: 1,
    cpuLimited: false,
    audioOnly: false,
    smallMode: false,
    visibility: 'visible',
    intervalMs: 30_000,
    screenHeight: 1440,
    screenFps: 30,
  };

  it('echoes the signed limits on join, defaulting to free', () => {
    const ready = (tier?: 'free' | 'paid') =>
      admitOrHold(createMeetRoomSnapshot(), payload(tier), now).reply.find(
        (message) => message.type === 'ready'
      );
    expect(ready()).toMatchObject({ streamLimits: { tier: 'free' } });
    expect(ready('paid')).toMatchObject({
      streamLimits: { tier: 'paid', screen: { maxHeight: 1440 } },
    });
  });

  it('flags a free publisher over its caps once and counts it for managers', () => {
    const token = payload();
    let state = admitOrHold(createMeetRoomSnapshot(), token, now).state;
    const first = applyMeetRoomCommand(state, {
      token,
      now,
      message: { type: 'media.quality', sample },
    });
    expect(first.direct).toEqual([
      {
        userId: token.userId,
        message: {
          type: 'stream.limits',
          limits: meetStreamEntitlement('free'),
        },
      },
    ]);
    state = first.state;
    const second = applyMeetRoomCommand(state, {
      token,
      now,
      message: { type: 'media.quality', sample },
    });
    expect(second.direct).toEqual([]);
    expect(
      summarizeRoomMediaQuality(second.state.mediaQuality, Date.parse(now))
        .overEntitlement
    ).toBe(1);
  });

  it('accepts the same stats from a paid publisher', () => {
    const token = payload('paid');
    const state = admitOrHold(createMeetRoomSnapshot(), token, now).state;
    const result = applyMeetRoomCommand(state, {
      token,
      now,
      message: { type: 'media.quality', sample },
    });
    expect(result.direct).toEqual([]);
    expect(result.state.mediaQuality?.[token.userId]?.overEntitlement).toBe(
      false
    );
  });
});
