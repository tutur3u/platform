import { beforeEach, expect, it, vi } from 'vitest';

const guestAccess = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'signed-guest' }) }),
}));
vi.mock('../lib/call-access', () => {
  class MeetCallAccessError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  }
  return {
    MeetCallAccessError,
    getMeetCallAccess: async () => {
      throw new MeetCallAccessError(401, 'Sign in');
    },
  };
});
vi.mock('../lib/guest-access', () => ({ getMeetGuestCallAccess: guestAccess }));

import { meetCallRoomRoute } from './room-service';

beforeEach(() => guestAccess.mockReset());

it.each([
  'whiteboard',
  'polls',
  'quiz-arena',
  'mira-room',
  'transcript-consent',
  'classroom-tools',
])(
  'enforces the required guest access boundary before %s room work',
  async (action) => {
    const request = new Request(
      `https://meet.test/api/meet-call/room/${action}`
    );
    const command = vi.fn();
    guestAccess.mockResolvedValue(null);
    const result = await meetCallRoomRoute(request, 'room', true, command);
    expect(result.status).toBe(401);
    expect(guestAccess).toHaveBeenCalledWith(
      'room',
      'signed-guest',
      request.headers
    );
    expect(command).not.toHaveBeenCalled();
  }
);
