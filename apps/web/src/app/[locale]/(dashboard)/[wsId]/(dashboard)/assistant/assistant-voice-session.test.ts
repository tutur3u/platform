import { describe, expect, it, vi } from 'vitest';
import { stopMediaStream } from './assistant-voice-session';

describe('stopMediaStream', () => {
  it('stops every active media track before voice mode unmounts', () => {
    const stopAudio = vi.fn();
    const stopVideo = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopAudio }, { stop: stopVideo }],
    } as unknown as MediaStream;

    stopMediaStream(stream);

    expect(stopAudio).toHaveBeenCalledOnce();
    expect(stopVideo).toHaveBeenCalledOnce();
  });

  it('accepts an absent stream', () => {
    expect(() => stopMediaStream(null)).not.toThrow();
  });
});
