import { describe, expect, it, vi } from 'vitest';
import { applyForcedMute } from './forced-media';
import {
  localTrackSource,
  planLocalTracks,
  userIdFromTrackName,
} from './negotiation';

describe('independent screen audio', () => {
  const media = {
    audioEnabled: false,
    videoEnabled: false,
    screenEnabled: true,
  };
  it('publishes screen audio with the microphone muted only when capture provides it', () => {
    expect(
      planLocalTracks('user', media, true).map((track) => track.kind)
    ).toEqual(['screen', 'screen_audio']);
    expect(
      planLocalTracks('user', media, false).map((track) => track.kind)
    ).toEqual(['screen']);
    expect(userIdFromTrackName('uuid-user-screen_audio')).toBe('uuid-user');
  });
  it('selects screen audio rather than microphone audio', () => {
    const mic = { id: 'mic' };
    const shared = { id: 'shared' };
    const local = { getAudioTracks: () => [mic] } as unknown as MediaStream;
    const screen = { getAudioTracks: () => [shared] } as unknown as MediaStream;
    expect(localTrackSource('screen_audio', local, screen)).toBe(shared);
    expect(localTrackSource('audio', local, screen)).toBe(mic);
  });
  it('muting a microphone preserves shared audio, while stopping a screen ends both tracks', () => {
    const microphone = { enabled: true };
    const screenAudio = { stop: vi.fn() };
    const video = { stop: vi.fn() };
    const local = {
      getAudioTracks: () => [microphone],
    } as unknown as MediaStream;
    const screen = {
      getTracks: () => [video, screenAudio],
    } as unknown as MediaStream;
    applyForcedMute(media, ['audio'], local, screen, vi.fn());
    expect(microphone.enabled).toBe(false);
    expect(screenAudio.stop).not.toHaveBeenCalled();
    expect(
      applyForcedMute(media, ['screen'], local, screen, vi.fn()).screenEnabled
    ).toBe(false);
    expect(screenAudio.stop).toHaveBeenCalledOnce();
    expect(video.stop).toHaveBeenCalledOnce();
  });
});
