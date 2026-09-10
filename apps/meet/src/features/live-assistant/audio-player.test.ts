import { afterEach, expect, it, vi } from 'vitest';
import { LiveAudioPlayer } from './audio';

afterEach(() => vi.unstubAllGlobals());
it('returns an output setup failure through the promise error path', async () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        throw new Error('output unavailable');
      }
    }
  );
  const player = new LiveAudioPlayer();
  let opening: Promise<void> | undefined;
  expect(() => {
    opening = player.unlock();
  }).not.toThrow();
  await expect(opening).rejects.toThrow('output unavailable');
});
