import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), target: vi.fn() }));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('../automation/forwarding', () => ({
  resolveForwardingMailbox: mocks.target,
}));

import type { MailRouteContext } from '../types';
import { updateMailboxSettings } from './settings';

const ctx = { user: { id: 'actor' } } as MailRouteContext;
const automation = {
  forwarding: { mode: 'mailbox' as const, address: 'phuc@example.com' },
  smartLabelsEnabled: true,
};

describe('mailbox automation permissions', () => {
  const update = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
  });
  function source() {
    const query = {
      update,
      eq: () => query,
      select: () => query,
      single: async () => ({
        data: { metadata: update.mock.calls[0]?.[0].metadata },
        error: null,
      }),
    };
    update.mockReturnValue(query);
    return {
      admin: { schema: () => ({ from: () => query }) },
      metadata: { existing: 'preserved' },
      mailbox: { id: 'source', type: 'shared', domainId: 'domain' },
      role: 'owner',
    };
  }
  it('requires source administration before any mutation', async () => {
    mocks.access.mockResolvedValue(null);
    expect(
      await updateMailboxSettings({
        ctx,
        mailboxId: 'source',
        payload: { automation },
      })
    ).toBeNull();
    expect(mocks.access).toHaveBeenCalledWith(ctx, 'source', [
      'owner',
      'admin',
    ]);
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects an inaccessible target without changing settings', async () => {
    mocks.access.mockResolvedValueOnce(source()).mockResolvedValueOnce(null);
    mocks.target.mockResolvedValue({ id: 'target' });
    await expect(
      updateMailboxSettings({
        ctx,
        mailboxId: 'source',
        payload: { automation },
      })
    ).rejects.toThrow('accessible');
    expect(update).not.toHaveBeenCalled();
  });
  it('preserves unrelated metadata when forwarding is saved', async () => {
    mocks.access
      .mockResolvedValueOnce(source())
      .mockResolvedValueOnce({ role: 'viewer' });
    mocks.target.mockResolvedValue({ id: 'target' });
    const settings = await updateMailboxSettings({
      ctx,
      mailboxId: 'source',
      payload: { automation },
    });
    expect(update).toHaveBeenCalledWith({
      metadata: { existing: 'preserved', mail_automation: automation },
    });
    expect(settings?.automation).toEqual(automation);
  });
});
