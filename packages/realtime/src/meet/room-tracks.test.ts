import { describe, expect, it } from 'vitest';
import { meetTrackKey, replaceRoomPublications } from './room-tracks';

describe('room publication replacement', () => {
  it('does not retire another participant or a different media track', () => {
    const current = {
      'old:audio': { userId: 'a', sessionId: 'old', trackName: 'audio' },
      'other:audio': { userId: 'b', sessionId: 'other', trackName: 'audio' },
      'old:video': { userId: 'a', sessionId: 'old', trackName: 'video' },
    };
    const result = replaceRoomPublications(current, [
      { userId: 'a', sessionId: 'new', trackName: 'audio' },
    ]);
    expect(Object.keys(result.tracks)).toEqual([
      'other:audio',
      'old:video',
      'new:audio',
    ]);
    expect(result.broadcast).toMatchObject([
      {
        type: 'track.closed',
        userId: 'a',
        sessionId: 'old',
        tracks: [current['old:audio']],
      },
    ]);
    expect(Object.keys(current)).toHaveLength(3);
  });

  it('retires all stale sessions for a track and leaves unnamed tracks alone', () => {
    const result = replaceRoomPublications(
      {
        'old:audio': { userId: 'a', sessionId: 'old', trackName: 'audio' },
        'older:audio': { userId: 'a', sessionId: 'older', trackName: 'audio' },
        'unnamed:0': { userId: 'a', sessionId: 'unnamed', mid: '0' },
      },
      [{ userId: 'a', sessionId: 'new', trackName: 'audio' }]
    );
    expect(Object.keys(result.tracks)).toEqual(['unnamed:0', 'new:audio']);
    expect(result.broadcast.map((message) => message.type)).toEqual([
      'track.closed',
      'track.closed',
    ]);
  });
});

it('rejects a late publish from a retired session', () => {
  const old = { userId: 'a', sessionId: 'old', trackName: 'audio' };
  const current = { userId: 'a', sessionId: 'new', trackName: 'audio' };
  const replaced = replaceRoomPublications({ 'old:audio': old }, [current]);
  const late = replaceRoomPublications(
    replaced.tracks,
    [old],
    replaced.retired
  );
  expect(late.stale).toBe(true);
  expect(late.tracks).toEqual(replaced.tracks);
  expect(late.broadcast).toEqual([]);
});
it('keeps colon-containing identifiers distinct', () => {
  const first = { userId: 'a', sessionId: 'a:b', trackName: 'c' };
  const second = { userId: 'b', sessionId: 'a', trackName: 'b:c' };
  expect(meetTrackKey(first)).not.toBe(meetTrackKey(second));
  expect(
    Object.keys(replaceRoomPublications({}, [first, second]).tracks)
  ).toHaveLength(2);
});

it('bounds retirement history without allowing an old publication to return', () => {
  const old = { userId: 'a', sessionId: 'current', trackName: 'audio' };
  const retired: Record<string, true> = Object.fromEntries(
    Array.from({ length: 512 }, (_, index) => [
      `a:session-${index}:audio`,
      true as const,
    ])
  );
  const current = { 'current:audio': old };
  const result = replaceRoomPublications(
    current,
    [{ ...old, sessionId: 'next' }],
    retired
  );
  expect(result.error).toBe('publisher_rejoin_required');
  expect(result.tracks).toBe(current);
  expect(result.retired).toBe(retired);
  expect(result.broadcast).toEqual([]);
  expect(
    replaceRoomPublications(
      current,
      [{ ...old, sessionId: 'session-0' }],
      retired
    ).error
  ).toBe('stale_publication');
});
