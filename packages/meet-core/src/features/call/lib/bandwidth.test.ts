import { describe, expect, test } from 'vitest';
import { encodingBudget, watchSenderBandwidth } from './bandwidth';

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
