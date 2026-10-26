import { beforeEach, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  actor: vi.fn(),
  admin: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: dependencies.actor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: dependencies.admin,
}));
vi.mock('@tuturuuu/apis/meet/guest-password-reset', () => ({
  resetMeetGuestPassword: dependencies.reset,
}));

import { resetGuestPassword } from './guest-password-reset.server';

beforeEach(() => {
  vi.resetAllMocks();
});

it('requires a verified Meet app session before creating an admin client', async () => {
  dependencies.actor.mockResolvedValue(null);
  expect(await resetGuestPassword('plan', 'guest', 'new password')).toEqual({
    error: 'UNAUTHORIZED',
  });
  expect(dependencies.actor).toHaveBeenCalledWith('meet');
  expect(dependencies.admin).not.toHaveBeenCalled();
  expect(dependencies.reset).not.toHaveBeenCalled();
});

it('injects the verified actor into the canonical owner-scoped reset helper', async () => {
  dependencies.actor.mockResolvedValue({ id: 'verified-owner' });
  dependencies.admin.mockResolvedValue({ fixture: true });
  dependencies.reset.mockResolvedValue({ data: { success: true } });
  expect(await resetGuestPassword('plan', 'guest', 'new password')).toEqual({
    data: { success: true },
  });
  expect(dependencies.admin).toHaveBeenCalledWith({ noCookie: true });
  expect(dependencies.reset).toHaveBeenCalledWith({
    client: { fixture: true },
    actorUserId: 'verified-owner',
    input: { planId: 'plan', guestName: 'guest', password: 'new password' },
  });
});
