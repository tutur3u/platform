import type { MeetRealtimeRoomTrack } from '@tuturuuu/realtime/meet';
import { describe, expect, it } from 'vitest';
import {
  diffLocalTracks,
  localTrackName,
  planLocalTracks,
  planRemoteSubscriptions,
  planWindowedRemoteSubscriptions,
  staleSubscriptions,
  userIdFromTrackName,
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

  it('keeps a reconnect replacement authoritative across subscription retries', () => {
    const first = track(OTHER, 'audio');
    const second = { ...first, sessionId: 'replacement-session' };
    const entries = { first, second };
    expect(planRemoteSubscriptions(entries, [], SELF)).toEqual([
      {
        location: 'remote',
        sessionId: second.sessionId,
        trackName: second.trackName,
      },
    ]);
    expect(
      planRemoteSubscriptions(
        entries,
        [`${second.sessionId}:${second.trackName}`],
        SELF
      )
    ).toEqual([]);
    expect(
      planRemoteSubscriptions(
        entries,
        [`${first.sessionId}:${first.trackName}`],
        SELF
      )
    ).toEqual([
      {
        location: 'remote',
        sessionId: second.sessionId,
        trackName: second.trackName,
      },
    ]);
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

describe('track ownership', () => {
  it('recovers the publisher from a track name', () => {
    expect(userIdFromTrackName('user-self-audio')).toBe('user-self');
    expect(userIdFromTrackName('user-self-video')).toBe('user-self');
    expect(userIdFromTrackName('user-self-screen')).toBe('user-self');
  });

  it('handles ids that themselves contain dashes', () => {
    const uuid = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
    expect(userIdFromTrackName(localTrackName(uuid, 'video'))).toBe(uuid);
  });

  it('rejects names that are not ours', () => {
    expect(userIdFromTrackName(undefined)).toBeNull();
    expect(userIdFromTrackName('')).toBeNull();
    expect(userIdFromTrackName('novalidkind')).toBeNull();
    expect(userIdFromTrackName('user-bogus')).toBeNull();
    expect(userIdFromTrackName('-audio')).toBeNull();
  });
});

it('keeps audio and screens across pages while pulling and closing camera tracks by window', () => {
  const track = (userId: string, kind: string) => ({
    userId,
    kind,
    sessionId: userId,
    trackName: `${userId}-${kind}`,
  });
  const publications = [
    { ...track('first', 'video'), cameraRids: ['h', 'm', 'l'] as const },
    track('later', 'video'),
    track('later', 'audio'),
    track('later', 'screen_audio'),
    track('later', 'screen'),
  ].map((entry) => ({
    ...entry,
    ...('cameraRids' in entry && entry.cameraRids
      ? { cameraRids: [...entry.cameraRids] }
      : {}),
  }));
  const remoteTracks = Object.fromEntries(
    publications.map((entry) => [
      `${entry.sessionId}:${entry.trackName}`,
      entry,
    ])
  );
  const plan = planWindowedRemoteSubscriptions({
    remoteTracks,
    subscribedKeys: ['later:later-video'],
    selfUserId: 'me',
    videoWindow: {
      cameraUserIds: ['first'],
      spotlightUserId: 'first',
      changedAt: 0,
    },
  });
  expect(plan.close).toEqual(['later:later-video']);
  expect(plan.pending.map((entry) => entry.trackName).sort()).toEqual([
    'first-video',
    'later-audio',
    'later-screen',
    'later-screen_audio',
  ]);
  expect(
    plan.pending.find((entry) => entry.trackName === 'first-video')
  ).toMatchObject({ simulcast: { preferredRid: 'h' } });
  expect(plan.layers.get('first:first-video')).toBe('high');
});

it('requests the layer a measured tile needs from ASCII-ordered publishers', () => {
  const publication = {
    userId: 'a',
    sessionId: 'a',
    trackName: 'a-video',
    cameraRids: ['f', 'h', 'q'] as Array<'f' | 'h' | 'q'>,
  };
  const plan = (heights: Array<[string, number]>, spotlightUserId?: string) =>
    planWindowedRemoteSubscriptions({
      remoteTracks: { 'a:a-video': publication },
      subscribedKeys: [],
      selfUserId: 'me',
      videoWindow: {
        cameraUserIds: ['a'],
        spotlightUserId,
        changedAt: 0,
        tileHeights: new Map(heights),
      },
    }).pending[0]?.simulcast;
  expect(plan([['a', 160]])).toEqual({
    preferredRid: 'q',
    priorityOrdering: 'asciibetical',
    ridNotAvailable: 'asciibetical',
  });
  expect(plan([['a', 280]])?.preferredRid).toBe('h');
  expect(plan([['a', 720]])?.preferredRid).toBe('f');
  expect(plan([['a', 160]], 'a')?.preferredRid).toBe('h');
  // A room server without ASCII simulcast gets no preference it would reject.
  expect(
    planWindowedRemoteSubscriptions({
      capabilities: [],
      remoteTracks: { 'a:a-video': publication },
      subscribedKeys: [],
      selfUserId: 'me',
      videoWindow: { cameraUserIds: ['a'], changedAt: 0 },
    }).pending[0]?.simulcast
  ).toBeUndefined();
});
