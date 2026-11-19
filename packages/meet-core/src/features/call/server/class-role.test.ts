import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const admin = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ kind: 'admin' }),
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/notes-admin', () => ({
  isMeetingNotesAdmin: admin,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => {
  class MeetCallAccessError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  return { MeetCallAccessError };
});

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { canViewMeetAttendance, resolveMeetClassRole } from './class-role';

const access = {
  isHost: false,
  canReadWorkspace: true,
  user: { id: 'user' },
  meeting: { ws_id: 'workspace' },
};

it('treats workspace admins as co-hosts and keeps guests from seeing attendance', async () => {
  expect(
    canViewMeetAttendance({ isHost: true, canReadWorkspace: false }, false)
  ).toBe(true);
  expect(
    canViewMeetAttendance({ isHost: false, canReadWorkspace: true }, true)
  ).toBe(true);
  expect(
    canViewMeetAttendance({ isHost: false, canReadWorkspace: true }, false)
  ).toBe(false);
  expect(
    canViewMeetAttendance({ isHost: false, canReadWorkspace: false }, true)
  ).toBe(false);

  admin.mockResolvedValueOnce(true);
  await expect(resolveMeetClassRole(access)).resolves.toEqual({
    coHost: true,
    participantKind: 'member',
  });
  await expect(
    resolveMeetClassRole({ ...access, canReadWorkspace: false })
  ).resolves.toEqual({ coHost: false, participantKind: 'guest' });
  expect(admin).toHaveBeenCalledOnce();
});

it('does not block joining when the co-host lookup fails, and fails attendance closed', async () => {
  admin.mockRejectedValueOnce(new Error('down'));
  await expect(resolveMeetClassRole(access)).resolves.toEqual({
    coHost: false,
    participantKind: 'member',
  });
  admin.mockRejectedValueOnce(new Error('down'));
  await expect(
    resolveMeetClassRole(access, { required: true })
  ).rejects.toBeInstanceOf(MeetCallAccessError);
});
