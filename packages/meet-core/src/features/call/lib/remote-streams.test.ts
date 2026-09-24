import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteStreamCache } from './remote-streams';

class FakeStream {
  constructor(private tracks: MediaStreamTrack[]) {}
  getTracks() {
    return this.tracks;
  }
}
afterEach(() => vi.unstubAllGlobals());
describe('remote stream identity', () => {
  it('preserves unaffected playback and releases absent participants', () => {
    vi.stubGlobal('MediaStream', FakeStream);
    const build = createRemoteStreamCache();
    const audio = {} as MediaStreamTrack;
    const video = {} as MediaStreamTrack;
    const screen = {} as MediaStreamTrack;
    const first = build({ a: { audio, video }, b: { audio } }, '');
    expect(build({ a: { audio, video }, b: { audio } }, 'a').a).toBe(first.a);
    const changed = build({ a: { audio, video, screen }, b: { audio } }, 'a');
    expect(changed.a).not.toBe(first.a);
    expect(changed.b).toBe(first.b);
    expect(changed.a?.getTracks()).toEqual([audio, screen]);
    expect(build({ a: { audio } }, '')).not.toHaveProperty('b');
    expect(build({ b: { audio } }, '').b).not.toBe(first.b);
  });
});
