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

import { meetCallRoomRoute, roomRoute } from './room-service';

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

it('refuses an anonymous guest before document or programming work', async () => {
  // A valid guest session still never reaches document tabs, channel tickets
  // or programming collaboration: those routes accept signed-in people only.
  guestAccess.mockResolvedValue({ guest: true, user: { id: 'guest' } });
  const work = vi.fn();
  for (const path of ['document?view=tabs', 'document', 'programming']) {
    const result = await roomRoute(
      new Request(`https://meet.test/api/meet-call/room/${path}`),
      'room',
      work
    );
    expect(result.status).toBe(401);
  }
  expect(work).not.toHaveBeenCalled();
  expect(guestAccess).not.toHaveBeenCalled();
});
