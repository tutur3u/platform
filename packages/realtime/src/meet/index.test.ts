import { describe, expect, it } from 'vitest';
import {
  canMeetRealtimePublish,
  meetRealtimeClientMessageSchema,
  meetRealtimeTokenPayloadSchema,
} from './index';

const baseTokenPayload = {
  displayName: 'Tuturuuu Host',
  exp: Math.floor(Date.now() / 1000) + 60,
  limits: {
    maxPublishers: 8,
    maxViewers: 96,
    video: {
      defaultCameraEnabled: false,
      maxFrameRate: 24,
      maxHeight: 720,
      maxWidth: 1280,
    },
  },
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'webinar',
  role: 'host',
  roomId: 'workspace-demo:weekly-standup',
  scopes: ['presence', 'chat:write', 'stage:write', 'sfu:publish'],
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
};

describe('Meet realtime protocol', () => {
  it('accepts signed token payloads with low-cost media limits', () => {
    const payload = meetRealtimeTokenPayloadSchema.parse(baseTokenPayload);

    expect(payload.mode).toBe('webinar');
    expect(payload.limits.video.defaultCameraEnabled).toBe(false);
    expect(payload.limits.video.maxHeight).toBe(720);
    expect(payload.limits.video.maxFrameRate).toBe(24);
  });

  it('rejects webinar viewer publish requests in the shared contract', () => {
    const viewer = meetRealtimeTokenPayloadSchema.parse({
      ...baseTokenPayload,
      role: 'viewer',
      scopes: ['presence', 'chat:write'],
      userId: '4b320da6-6c8a-43fe-b1bf-09fbe77303f9',
    });

    expect(canMeetRealtimePublish(viewer, 'audio')).toBe(false);
    expect(canMeetRealtimePublish(viewer, 'video')).toBe(false);
  });

  it('parses SFU track publish requests without exposing Cloudflare secrets', () => {
    const message = meetRealtimeClientMessageSchema.parse({
      requestId: 'request-1',
      sessionDescription: {
        sdp: 'v=0',
        type: 'offer',
      },
      sessionId: 'cloudflare-session-1',
      tracks: [
        {
          kind: 'audio',
          mid: '0',
          trackName: 'host-audio',
        },
      ],
      type: 'sfu.tracks.publish',
    });

    expect(message.type).toBe('sfu.tracks.publish');
    expect('secret' in message).toBe(false);
  });
});
