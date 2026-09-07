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
    closeTrack: vi.fn(),
    isCurrent: () => true,
    reset: vi.fn(),
  });
  expect(sender.replaceTrack).toHaveBeenCalledWith(source);
  expect(remaining).toEqual([audio]);
});

describe('stopped screen shares', () => {
  function fixture(plan: typeof screen | typeof audio = screen) {
    const sender = { replaceTrack: vi.fn() } as unknown as RTCRtpSender;
    const senders = new Map([[plan.trackName, sender]]);
    const closeTrack = vi.fn().mockResolvedValue(undefined);
    const reset = vi.fn(() => senders.clear());
    const pc = {
      getTransceivers: () => [{ mid: '2', sender }],
    } as unknown as RTCPeerConnection;
    return {
      reset,
      sender,
      senders,
      closeTrack,
      options: {
        published: [plan],
        desired: [],
        senders,
        pc,
        sessionId: 'session',
        stream,
        screenStream: null,
        closeTrack,
        reset,
        isCurrent: () => true,
      },
    };
  }

  it('retires the old SFU publication so the next share publishes afresh', async () => {
    const { options, closeTrack, senders, sender } = fixture();
    expect(await syncPublishedSenders(options)).toEqual([]);
    expect(closeTrack).toHaveBeenCalledWith('session', {
      ...screen,
      mid: '2',
      location: 'local',
    });
    expect(senders.has(screen.trackName)).toBe(false);
    expect(sender.replaceTrack).toHaveBeenCalledWith(null);
  });

  it('resets the publisher when a close may have succeeded remotely', async () => {
    const { options, closeTrack, senders, reset } = fixture();
    closeTrack.mockRejectedValue(new Error('offline'));
    await expect(syncPublishedSenders(options)).rejects.toThrow('offline');
    expect(reset).toHaveBeenCalledTimes(1);
    expect(senders.has(screen.trackName)).toBe(false);
  });
  it('retires a device publication whose source disappeared', async () => {
    const { options, closeTrack, senders } = fixture(audio);
    options.stream = {
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    } as unknown as MediaStream;
    expect(await syncPublishedSenders(options)).toEqual([]);
    expect(closeTrack).toHaveBeenCalledWith('session', {
      ...audio,
      mid: '2',
      location: 'local',
    });
    expect(senders.has(audio.trackName)).toBe(false);
  });

  it('does not reset a replacement publisher after an obsolete close fails', async () => {
    const { options, closeTrack, reset } = fixture();
    options.isCurrent = () => false;
    closeTrack.mockRejectedValue(new Error('late timeout'));
    await expect(syncPublishedSenders(options)).rejects.toThrow('late timeout');
    expect(reset).not.toHaveBeenCalled();
  });
});
