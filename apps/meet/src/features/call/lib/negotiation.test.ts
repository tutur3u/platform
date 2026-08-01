import type { MeetRealtimeRoomTrack } from '@tuturuuu/realtime/meet';
import { describe, expect, it } from 'vitest';
import {
  diffLocalTracks,
  localTrackName,
  planLocalTracks,
  planRemoteSubscriptions,
  staleSubscriptions,
  videoConstraints,
} from './negotiation';

const SELF = 'user-self';
const OTHER = 'user-other';

function track(userId: string, kind: string): MeetRealtimeRoomTrack {
  return {
    kind,
    sessionId: `session-${userId}`,
    trackName: `${userId}-${kind}`,
    userId,
  };
}

describe('local track planning', () => {
  it('publishes only what the user has enabled', () => {
    expect(
      planLocalTracks(SELF, {
        audioEnabled: true,
        screenEnabled: false,
        videoEnabled: false,
      })
    ).toEqual([{ kind: 'audio', trackName: 'user-self-audio' }]);
  });

  it('keeps screen share separate from the camera', () => {
    const plan = planLocalTracks(SELF, {
      audioEnabled: true,
      screenEnabled: true,
      videoEnabled: true,
    });

    expect(plan.map((t) => t.kind)).toEqual(['audio', 'video', 'screen']);
    expect(new Set(plan.map((t) => t.trackName)).size).toBe(3);
  });

  it('namespaces track names per participant', () => {
    expect(localTrackName(SELF, 'video')).not.toBe(
      localTrackName(OTHER, 'video')
    );
  });
});

describe('local track diffing', () => {
  const audio = { kind: 'audio' as const, trackName: 'user-self-audio' };
  const video = { kind: 'video' as const, trackName: 'user-self-video' };

  it('publishes newly enabled tracks only', () => {
    expect(diffLocalTracks([audio], [audio, video])).toEqual({
      publish: [video],
      unpublish: [],
    });
  });

  it('unpublishes tracks the user turned off', () => {
    expect(diffLocalTracks([audio, video], [audio])).toEqual({
      publish: [],
      unpublish: [video],
    });
  });

  it('is a no-op when nothing changed', () => {
    expect(diffLocalTracks([audio, video], [video, audio])).toEqual({
      publish: [],
      unpublish: [],
    });
  });
});

describe('remote subscription planning', () => {
  const remoteTracks = {
    'session-user-other:user-other-audio': track(OTHER, 'audio'),
    'session-user-other:user-other-video': track(OTHER, 'video'),
  };

  it('pulls every remote track we have not subscribed to', () => {
    const plan = planRemoteSubscriptions(remoteTracks, [], SELF);

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      location: 'remote',
      sessionId: 'session-user-other',
    });
  });

  it('never re-pulls an existing subscription', () => {
    const plan = planRemoteSubscriptions(
      remoteTracks,
      ['session-user-other:user-other-audio'],
      SELF
    );

    expect(plan.map((t) => t.trackName)).toEqual(['user-other-video']);
  });

  it('never subscribes to our own tracks', () => {
    const plan = planRemoteSubscriptions(
      { 'session-user-self:user-self-audio': track(SELF, 'audio') },
      [],
      SELF
    );

    expect(plan).toEqual([]);
  });

  it('reports subscriptions whose publisher left', () => {
    expect(
      staleSubscriptions(remoteTracks, [
        'session-user-other:user-other-audio',
        'session-gone:ghost-video',
      ])
    ).toEqual(['session-gone:ghost-video']);
  });
});

describe('video constraints', () => {
  it('caps resolution and frame rate at the workspace ceiling', () => {
    expect(
      videoConstraints({ maxFrameRate: 24, maxHeight: 720, maxWidth: 1280 })
    ).toEqual({
      frameRate: { ideal: 24, max: 24 },
      height: { ideal: 720, max: 720 },
      width: { ideal: 1280, max: 1280 },
    });
  });
});
