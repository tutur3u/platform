import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

import {
  hasManagedMailMailbox,
  managedMailDomain,
} from './mailbox-notification-access';

function query(data: unknown) {
  const result = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  result.select.mockReturnValue(result);
  result.eq.mockReturnValue(result);
  result.not.mockReturnValue(result);
  return result;
}

describe('Mail-only configured mailbox authority', () => {
  let domain: ReturnType<typeof query>;
  let mailbox: ReturnType<typeof query>;
  let member: ReturnType<typeof query>;
  let identity: ReturnType<typeof vi.fn>;
  const user = { id: 'owner', email: 'owner@team.tuturuuu.com' };
  beforeEach(() => {
    vi.clearAllMocks();
    domain = query({ id: 'domain' });
    mailbox = query({ id: 'mailbox' });
    member = query({ user_id: user.id });
    identity = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: user.id,
          email: user.email,
          email_confirmed_at: '2026-01-01T00:00:00Z',
          banned_until: null,
        },
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === 'mail_domains') return domain;
      if (table === 'mail_mailboxes') return mailbox;
      if (table === 'mail_mailbox_members') return member;
      throw new Error('Unexpected table');
    });
    mocks.admin.mockResolvedValue({
      auth: { admin: { getUserById: identity } },
      schema: vi.fn(() => ({ from })),
    });
  });
  it('accepts exact DNS descendants but rejects lookalikes and malformed labels', () => {
    expect(managedMailDomain('OWNER@NORTH.TEAM.TUTURUUU.COM')).toBe(
      'north.team.tuturuuu.com'
    );
    expect(managedMailDomain('owner@tuturuuu.com')).toBe('tuturuuu.com');
    for (const email of [
      'owner@tuturuuu.com.evil.test',
      'owner@eviltuturuuu.com',
      'owner@-team.tuturuuu.com',
      'owner@team-.tuturuuu.com',
      'owner@team..tuturuuu.com',
      'owner@@tuturuuu.com',
      ' owner@team.tuturuuu.com',
      'owner@tuturuuu.com.',
    ]) {
      expect(managedMailDomain(email)).toBeNull();
    }
  });
  it('binds current identity, configured domain, owned mailbox and membership', async () => {
    expect(await hasManagedMailMailbox(user)).toBe(true);
    expect(identity).toHaveBeenCalledWith(user.id);
    expect(domain.eq).toHaveBeenCalledWith('domain', 'team.tuturuuu.com');
    expect(domain.eq).toHaveBeenCalledWith('status', 'active');
    expect(domain.not).toHaveBeenCalledWith('verified_at', 'is', null);
    expect(mailbox.eq).toHaveBeenCalledWith('created_by', user.id);
    expect(mailbox.eq).toHaveBeenCalledWith('address', user.email);
    expect(member.eq).toHaveBeenCalledWith('mailbox_id', 'mailbox');
    expect(member.eq).toHaveBeenCalledWith('user_id', user.id);
  });
  for (const stored of [
    null,
    { id: user.id, email: user.email, email_confirmed_at: null },
    {
      id: user.id,
      email: 'changed@team.tuturuuu.com',
      email_confirmed_at: 'confirmed',
    },
    {
      id: user.id,
      email: user.email,
      email_confirmed_at: 'confirmed',
      banned_until: '2099-01-01T00:00:00Z',
    },
  ]) {
    it('rejects absent/unconfirmed/changed/banned persisted identity', async () => {
      identity.mockResolvedValue({ data: { user: stored }, error: null });
      expect(await hasManagedMailMailbox(user)).toBe(false);
      expect(domain.select).not.toHaveBeenCalled();
    });
  }
  it('rejects missing configured authority or mailbox/member', async () => {
    domain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await hasManagedMailMailbox(user)).toBe(false);
    mailbox.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await hasManagedMailMailbox(user)).toBe(false);
    member.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await hasManagedMailMailbox(user)).toBe(false);
  });
  it('propagates lookup failure instead of treating it as authorization', async () => {
    domain.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error('fixture unavailable'),
    });
    await expect(hasManagedMailMailbox(user)).rejects.toThrow(
      'fixture unavailable'
    );
  });
});
