import { describe, expect, it } from 'vitest';
import { replaceRoomPublications } from './room-tracks';

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
