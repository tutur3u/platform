import { describe, expect, it, test } from 'vitest';
import {
  encodingBudget,
  initialSendEncodings,
  planSenderEncodings,
  watchSenderBandwidth,
} from './bandwidth';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('media bandwidth budgets', () => {
  test('preserves speech and screen readability under congestion', () => {
    expect(encodingBudget('audio', 'saver', 100000, 900)).toEqual({
      maxBitrate: 48000,
    });
    expect(encodingBudget('screen', 'auto', 300000, 900)).toMatchObject({
      scaleResolutionDownBy: 1,
      maxFramerate: 8,
    });
    expect(encodingBudget('video', 'auto', 300000, 900)).toMatchObject({
      scaleResolutionDownBy: 2,
      maxFramerate: 15,
    });
  });

  test('pauses alone, resumes for an audience, and retains existing encoding metadata', async () => {
    let audience = false;
    const applied: RTCRtpSendParameters[] = [];
    const sender = {
      track: { kind: 'video' },
      getParameters: () => ({
        encodings: [{ rid: 'main' }],
        transactionId: 'same',
      }),
      setParameters: async (parameters: RTCRtpSendParameters) => {
        applied.push(parameters);
      },
    } as unknown as RTCRtpSender;
    const peer = {
      connectionState: 'connected',
      signalingState: 'stable',
      getStats: async () => new Map(),
    } as unknown as RTCPeerConnection;
    const watcher = watchSenderBandwidth({
      readPeer: () => peer,
      readSenders: () => new Map([['camera', sender]]),
      mode: () => 'auto',
      hasAudience: () => audience,
    });
    try {
      await settle();
      expect(applied[0]?.encodings[0]).toMatchObject({
        active: false,
        rid: 'main',
        maxBitrate: 900000,
      });
      audience = true;
      watcher.refresh();
      await settle();
      expect(applied[1]?.encodings[0]?.active).toBe(true);
      watcher.refresh();
      await settle();
      expect(applied).toHaveLength(2);
    } finally {
      watcher.dispose();
    }
  });

  test('shares constrained capacity across video senders and restores quality gradually', async () => {
    let available: number | undefined = 220000;
    const applied: RTCRtpSendParameters[] = [];
    const makeSender = () =>
      ({
        track: { kind: 'video' },
        getParameters: () => ({ encodings: [{}] }),
        setParameters: async (value: RTCRtpSendParameters) => {
          applied.push(value);
        },
      }) as unknown as RTCRtpSender;
    const senders = new Map([
      ['camera', makeSender()],
      ['screen', makeSender()],
    ]);
    const peer = {
      connectionState: 'connected',
      signalingState: 'stable',
      getStats: async () =>
        new Map([
          [
            'candidate',
            {
              type: 'candidate-pair',
              state: 'succeeded',
              nominated: true,
              availableOutgoingBitrate: available,
            },
          ],
        ]),
    } as unknown as RTCPeerConnection;
    const watcher = watchSenderBandwidth({
      readPeer: () => peer,
      readSenders: () => senders,
      mode: () => 'auto',
      hasAudience: () => true,
    });
    try {
      await settle();
      expect(applied[0]?.encodings[0]?.maxBitrate).toBe(30400);
      available = 100000;
      watcher.refresh();
      await settle();
      expect(applied.at(-2)?.encodings[0]?.active).toBe(false);
      available = undefined;
      for (let i = 0; i < 5; i++) {
        watcher.refresh();
        await settle();
      }
      expect(applied.at(-2)?.encodings[0]?.scaleResolutionDownBy).toBe(2);
      available = 4000000;
      watcher.refresh();
      await settle();
      expect(applied.at(-2)?.encodings[0]?.scaleResolutionDownBy).toBe(2);
      for (let i = 0; i < 3; i++) {
        watcher.refresh();
        await settle();
      }
      expect(applied.at(-2)?.encodings[0]?.scaleResolutionDownBy).toBe(1);
    } finally {
      watcher.dispose();
    }
  });
});

it('scales grid camera budgets down at each room tier while preserving spotlight and screen detail', () => {
  const camera = (participants: number, spotlight = false) =>
    encodingBudget('video', 'auto', null, null, { participants, spotlight });
  const bitrate = (participants: number) => camera(participants).maxBitrate!;
  expect(bitrate(15)).toBeLessThan(bitrate(4));
  expect(bitrate(35)).toBeLessThan(bitrate(15));
  expect(bitrate(50)).toBeLessThan(bitrate(35));
  expect(camera(50).scaleResolutionDownBy).toBe(2);
  expect(camera(50, true).scaleResolutionDownBy).toBe(1);
  expect(
    encodingBudget('screen', 'auto', null, null, { participants: 50 })
  ).toMatchObject({ scaleResolutionDownBy: 1 });
});

it('advertises three RIDs and adapts an unsupported browser with a single encoding', () => {
  expect(initialSendEncodings('video', 50).map((layer) => layer.rid)).toEqual([
    'h',
    'm',
    'l',
  ]);
  expect(initialSendEncodings('video', 50, false)).toEqual([
    expect.objectContaining({ scaleResolutionDownBy: 2 }),
  ]);
  expect(initialSendEncodings('audio', 50)).toEqual([{ maxBitrate: 48000 }]);
});

it.each([
  { available: 180000, rtt: 250, loss: 0 },
  { available: 1000000, rtt: 1200, loss: 0 },
  { available: 1000000, rtt: 250, loss: 0.18 },
])('suspends video under congestion without suspending audio', (network) => {
  const room = { participants: 50, visibleTiles: 9 };
  const camera = initialSendEncodings('video', 50);
  expect(
    planSenderEncodings('video', 'auto', network, room, true, camera).every(
      (layer) => !layer.active
    )
  ).toBe(true);
  expect(
    planSenderEncodings('audio', 'auto', network, room, true, [{}])
  ).toMatchObject([{ active: true, maxBitrate: 48000 }]);
  expect(
    planSenderEncodings(
      'video',
      'auto',
      { available: 1000000, rtt: 100, loss: 0 },
      room,
      true,
      camera
    ).some((layer) => layer.active)
  ).toBe(true);
});
