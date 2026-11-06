import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GROUP_POLICY } from '../groups/policy';
import type { MailRouteContext } from '../types';
import { getMailUnreadCounts, requireMailboxAccess } from './bootstrap';
import { queryMailMessageRows } from './search';
import { getAdminClient } from './shared';

vi.mock('./search', () => ({ queryMailMessageRows: vi.fn() }));
vi.mock('./shared', async (original) => ({
  ...(await original<object>()),
  getAdminClient: vi.fn(),
  ensureSystemLabels: vi.fn(),
}));
const ctx = {
  user: { id: 'user', email: 'user@example.com' },
} as MailRouteContext;
function setAccess(
  role: string,
  personalStatus = 'active',
  sendAs: 'members' | 'managers' = 'managers',
  authEmail = 'user@example.com',
  authConfirmed = true
) {
  const results = [
    { role },
    {
      id: 'group',
      address: 'group@example.com',
      type: 'shared',
      status: 'active',
      domain_id: 'domain',
      metadata: { mail_group: { ...DEFAULT_GROUP_POLICY, sendAs } },
    },
    { status: personalStatus },
  ];
  const addressFilters: unknown[] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      if (column === 'address') addressFilters.push(value);
      return query;
    },
    maybeSingle: async () => ({ data: results.shift(), error: null }),
  };
  vi.mocked(getAdminClient).mockResolvedValue({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              email: authEmail,
              email_confirmed_at: authConfirmed
                ? '2026-06-01T00:00:00.000Z'
                : null,
              id,
            },
          },
          error: null,
        }),
      },
    },
    schema: () => ({ from: () => query }),
  } as never);
  return { addressFilters };
}
describe('group access', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows viewers to send only when all members have send-as permission', async () => {
    setAccess('viewer', 'active', 'members');
    expect(
      await requireMailboxAccess(ctx, 'group', ['owner', 'admin', 'sender'])
    ).not.toBeNull();
    setAccess('viewer');
    expect(
      await requireMailboxAccess(ctx, 'group', ['owner', 'admin', 'sender'])
    ).toBeNull();
  });
  it('denies a sender role under managers-only policy', async () => {
    setAccess('sender');
    expect(
      await requireMailboxAccess(ctx, 'group', ['owner', 'admin', 'sender'])
    ).toBeNull();
  });
  it('does not grant settings administration to ordinary members', async () => {
    setAccess('viewer', 'active', 'members');
    expect(
      await requireMailboxAccess(ctx, 'group', ['owner', 'admin'])
    ).toBeNull();
  });
  it('revokes access for suspended personal identities even when group owner', async () => {
    setAccess('owner', 'disabled');
    expect(await requireMailboxAccess(ctx, 'group')).toBeNull();
  });
  it('checks the group personal-mailbox gate by the confirmed Auth email, not the claim (SR-926)', async () => {
    const forgedCtx = {
      user: { id: 'user', email: 'victim@example.com' },
    } as MailRouteContext;
    const { addressFilters } = setAccess(
      'viewer',
      'active',
      'members',
      'User@Example.com'
    );
    expect(await requireMailboxAccess(forgedCtx, 'group')).not.toBeNull();
    expect(addressFilters).toEqual(['user@example.com']);
  });
  it('denies group access when the Auth email is unconfirmed, whatever the claim says (SR-926)', async () => {
    const { addressFilters } = setAccess(
      'owner',
      'active',
      'members',
      'user@example.com',
      false
    );
    expect(await requireMailboxAccess(ctx, 'group')).toBeNull();
    expect(addressFilters).toEqual([]);
  });
});

it('counts the same non-archived mailboxes from the authenticated user membership query', async () => {
  const eq = vi.fn();
  const neq = vi.fn();
  const query = {
    select: vi.fn(() => query),
    neq: (...args: unknown[]) => {
      neq(...args);
      return query;
    },
    eq: (...args: unknown[]) => {
      eq(...args);
      return query;
    },
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
    then: (resolve: (value: object) => unknown) =>
      Promise.resolve({ data: [{ mailbox_id: 'allowed' }], error: null }).then(
        resolve
      ),
  };
  vi.mocked(getAdminClient).mockResolvedValue({
    schema: () => ({ from: () => query }),
  } as never);
  vi.mocked(queryMailMessageRows).mockResolvedValue({ rows: [], total: 4 });
  expect(await getMailUnreadCounts(ctx)).toEqual({ allowed: 4 });
  expect(eq).toHaveBeenCalledWith('user_id', 'user');
  expect(neq).toHaveBeenCalledWith('mailbox.status', 'archived');
  expect(queryMailMessageRows).toHaveBeenCalledWith(
    expect.objectContaining({ mailboxId: 'allowed', userId: 'user' })
  );
});
