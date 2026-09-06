import { describe, expect, it, vi } from 'vitest';
import { attachMediaPlayback } from './media-playback';

function fixture() {
  const document = new EventTarget();
  const play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const element = {
    srcObject: null,
    ownerDocument: document,
    play,
  } as unknown as HTMLMediaElement;
  const stream = {} as MediaStream;
  return { document, element, play, stream };
}

describe('media playback recovery', () => {
  it('exposes blocked audio and retries after user interaction', async () => {
    const { document, element, play, stream } = fixture();
    play.mockRejectedValueOnce(
      new DOMException('Requires activation', 'NotAllowedError')
    );
    const onBlocked = vi.fn();
    const cleanup = attachMediaPlayback(element, stream, onBlocked);
    await Promise.resolve();
    expect(onBlocked).toHaveBeenLastCalledWith(true);
    document.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(2);
    expect(onBlocked).toHaveBeenLastCalledWith(false);
    cleanup();
    document.dispatchEvent(new Event('keydown'));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not report stale playback rejection after stream replacement', async () => {
    const { element, play, stream } = fixture();
    play.mockRejectedValueOnce(
      new DOMException('Requires activation', 'NotAllowedError')
    );
    const onBlocked = vi.fn();
    const cleanup = attachMediaPlayback(element, stream, onBlocked);
    cleanup();
    await Promise.resolve();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('clears a removed stream without attempting playback', () => {
    const { element, play, stream } = fixture();
    element.srcObject = stream;
    const cleanup = attachMediaPlayback(element, null, vi.fn());
    expect(element.srcObject).toBeNull();
    expect(play).not.toHaveBeenCalled();
    cleanup();
  });
});
