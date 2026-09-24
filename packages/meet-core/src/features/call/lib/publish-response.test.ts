import { describe, expect, it } from 'vitest';
import { assertPublishedResponse } from './publish-response';

describe('SFU publication acknowledgement', () => {
  it('rejects HTTP-success responses with failed tracks', () => {
    expect(() =>
      assertPublishedResponse({
        sessionDescription: { type: 'answer', sdp: 'answer' },
        tracks: [{ trackName: 'audio', errorCode: 'not_found_track_error' }],
      })
    ).toThrow('sfu_track_publish_failed');
  });
  it('requires an SDP answer before claiming publication', () => {
    expect(() => assertPublishedResponse(undefined)).toThrow();
    expect(() => assertPublishedResponse({})).toThrow();
    expect(() =>
      assertPublishedResponse({
        sessionDescription: { type: 'offer', sdp: 'offer' },
      })
    ).toThrow();
    expect(() =>
      assertPublishedResponse({
        sessionDescription: { type: 'answer', sdp: 'answer' },
      })
    ).not.toThrow();
  });
});
