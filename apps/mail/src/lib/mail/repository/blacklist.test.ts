import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  permissions: vi.fn(),
  message: vi.fn(),
  linked: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getMailMessage: mocks.message }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));

import { getMailBlacklistContext } from './blacklist';

const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: mocks.linked,
};
const ctx = {
  user: { id: 'viewer' },
  supabase: { from: vi.fn(() => query) },
} as unknown as MailRouteContext;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ admin: 'admin' });
  mocks.linked.mockResolvedValue({
    data: { virtual_user_id: 'root-user' },
    error: null,
  });
  mocks.permissions.mockResolvedValue({ containsPermission: () => true });
  mocks.message.mockResolvedValue({
    subject: 'Delivery Status Notification (Failure)',
    bodyText: 'following recipients:\nfailed@example.com',
  });
});
it('requires mailbox access before Infrastructure authorization', async () => {
  mocks.access.mockResolvedValue(null);
  expect(await getMailBlacklistContext(ctx, 'mailbox', 'message')).toBeNull();
  expect(mocks.linked).not.toHaveBeenCalled();
});
it('rejects members without the root-workspace link', async () => {
  mocks.linked.mockResolvedValue({ data: null, error: null });
  expect(await getMailBlacklistContext(ctx, 'mailbox', 'message')).toBeNull();
  expect(mocks.message).not.toHaveBeenCalled();
});
it('requires view_infrastructure as well as the root-workspace link', async () => {
  mocks.permissions.mockResolvedValue({ containsPermission: () => false });
  expect(await getMailBlacklistContext(ctx, 'mailbox', 'message')).toBeNull();
  expect(mocks.message).not.toHaveBeenCalled();
});
it('uses the Mail session principal and derives recipients from the authorized message', async () => {
  expect(await getMailBlacklistContext(ctx, 'mailbox', 'message')).toEqual({
    admin: 'admin',
    recipients: ['failed@example.com'],
  });
  expect(mocks.permissions).toHaveBeenCalledWith({
    wsId: '00000000-0000-0000-0000-000000000000',
    user: ctx.user,
  });
  expect(query.eq).toHaveBeenCalledWith('platform_user_id', 'viewer');
  expect(mocks.message).toHaveBeenCalledWith({
    ctx,
    mailboxId: 'mailbox',
    messageId: 'message',
  });
});
it('surfaces lookup failures rather than silently changing permissions', async () => {
  mocks.linked.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(
    getMailBlacklistContext(ctx, 'mailbox', 'message')
  ).rejects.toThrow('offline');
});
