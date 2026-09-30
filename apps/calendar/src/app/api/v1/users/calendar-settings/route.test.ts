import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

import { PATCH } from './route';

const context = {
  user: { id: 'authenticated-user' },
  supabase: { from: mocks.from },
};
const request = (body: unknown) =>
  new Request('https://calendar.test/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
const patch = PATCH as unknown as (
  req: Request,
  auth: typeof context
) => Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    update: mocks.update,
    eq: mocks.eq,
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { timezone: 'Asia/Ho_Chi_Minh' },
      error: null,
    }),
  };
  mocks.from.mockReturnValue(query);
  mocks.update.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
});

describe('personal calendar preference scope', () => {
  it('updates only the authenticated user and strips supplied actor fields', async () => {
    expect(
      (
        await patch(
          request({ timezone: 'Asia/Ho_Chi_Minh', user_id: 'another-user' }),
          context
        )
      ).status
    ).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ timezone: 'Asia/Ho_Chi_Minh' });
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'authenticated-user');
  });

  it.each(['+07:00', 'Mars/Unknown', ''])(
    'rejects invalid timezone %s before database access',
    async (timezone) => {
      expect((await patch(request({ timezone }), context)).status).toBe(400);
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
});
