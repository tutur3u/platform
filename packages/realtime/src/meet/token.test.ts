import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './index';
import { signMeetRealtimeToken, verifyMeetRealtimeToken } from './token';

const payload = {
  exp: Math.floor(Date.now() / 1000) + 60,
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call' as const,
  role: 'speaker' as const,
  roomId: 'room-alpha',
  scopes: ['presence', 'sfu:publish'],
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
};

describe('Meet realtime token signing', () => {
  it('round-trips signed join tokens', () => {
    const token = signMeetRealtimeToken(payload, 'test-secret');

    expect(verifyMeetRealtimeToken(token, 'test-secret')).toEqual(
      meetRealtimeTokenPayloadSchema.parse(payload)
    );
  });

  it('rejects expired tokens', () => {
    const token = signMeetRealtimeToken(
      {
        ...payload,
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      'test-secret'
    );

    expect(verifyMeetRealtimeToken(token, 'test-secret')).toBeNull();
  });
});
