import { describe, expect, it, vi } from 'vitest';
import { syncPublishedSenders } from './published-senders';

const audio = { kind: 'audio' as const, trackName: 'user-audio' };
const screen = { kind: 'screen' as const, trackName: 'user-screen' };
const source = { enabled: false } as MediaStreamTrack;
const stream = {
  getAudioTracks: () => [source],
  getVideoTracks: () => [],
} as unknown as MediaStream;

it('keeps a muted device attached so SFU inactivity does not expire it', async () => {
  const sender = { replaceTrack: vi.fn() } as unknown as RTCRtpSender;
  const remaining = await syncPublishedSenders({
    published: [audio],
    desired: [],
    senders: new Map([[audio.trackName, sender]]),
    pc: null,
    sessionId: null,
    stream,
    screenStream: null,
    closeScreen: vi.fn(),
  });
  expect(sender.replaceTrack).toHaveBeenCalledWith(source);
  expect(source.enabled).toBe(false);
  expect(remaining).toEqual([audio]);
});

describe('stopped screen shares', () => {
  function fixture() {
    const sender = { replaceTrack: vi.fn() } as unknown as RTCRtpSender;
    const senders = new Map([[screen.trackName, sender]]);
    const closeScreen = vi.fn().mockResolvedValue(undefined);
    const pc = {
      getTransceivers: () => [{ mid: '2', sender }],
    } as unknown as RTCPeerConnection;
    return {
      sender,
      senders,
      closeScreen,
      options: {
        published: [screen],
        desired: [],
        senders,
        pc,
        sessionId: 'session',
        stream,
        screenStream: null,
        closeScreen,
      },
    };
  }

  it('retires the old SFU publication so the next share publishes afresh', async () => {
    const { options, closeScreen, senders, sender } = fixture();
    expect(await syncPublishedSenders(options)).toEqual([]);
    expect(closeScreen).toHaveBeenCalledWith('session', {
      ...screen,
      mid: '2',
      location: 'local',
    });
    expect(senders.has(screen.trackName)).toBe(false);
    expect(sender.replaceTrack).toHaveBeenCalledWith(null);
  });

  it('retains the publication for retry when closing fails', async () => {
    const { options, closeScreen, senders } = fixture();
    closeScreen.mockRejectedValue(new Error('offline'));
    await expect(syncPublishedSenders(options)).rejects.toThrow('offline');
    expect(senders.has(screen.trackName)).toBe(true);
  });
});
