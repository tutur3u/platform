import { describe, expect, it } from 'vitest';
import type { MailRouteContext } from '../types';
import { hasSystemLabels, resolvePersonalMailbox } from './bootstrap-personal';
import { SYSTEM_LABELS } from './shared';

const ctx = {
  user: { email: 'Person@Example.com', id: 'user' },
} as MailRouteContext;

type AuthUser = {
  email: string | null;
  email_confirmed_at: string | null;
  id: string;
};

const confirmedAuthUser: AuthUser = {
  email: 'Person@Example.com',
  email_confirmed_at: '2026-06-01T00:00:00.000Z',
  id: 'user',
};

function createAdmin({
  authError = null,
  authUser = confirmedAuthUser,
  mailbox,
  members,
}: {
  authError?: { message: string } | null;
  authUser?: AuthUser | null;
  mailbox: Record<string, unknown> | null;
  members: { mailbox_id: string; role: string }[];
}) {
  const writes: string[] = [];
  const addressFilters: unknown[] = [];
  const inserts: Record<string, unknown>[] = [];
  const table = (name: string) => {
    const rows =
      name === 'users'
        ? { data: [{ display_name: 'Person', id: 'user' }], error: null }
        : { data: members, error: null };
    const query: Record<string, unknown> = {};
    // Filters resolve to the list result and keep the builder chainable.
    const chain = () => Object.assign(Promise.resolve(rows), query);
    for (const method of ['select', 'in']) query[method] = chain;
    query.eq = (column: string, value: unknown) => {
      if (name === 'mail_mailboxes' && column === 'address') {
        addressFilters.push(value);
      }
      return chain();
    };
    query.maybeSingle = async () =>
      name === 'mail_domains'
        ? { data: { id: 'domain' }, error: null }
        : { data: mailbox, error: null };
    query.upsert = async () => {
      writes.push(`upsert:${name}`);
      return { error: null };
    };
    query.insert = (value: Record<string, unknown>) => {
      writes.push(`insert:${name}`);
      inserts.push(value);
      return {
        select: () => ({
          single: async () => ({ data: { id: 'new', ...value }, error: null }),
        }),
      };
    };
    query.update = () => {
      writes.push(`update:${name}`);
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({ data: mailbox, error: null }),
          }),
        }),
      };
    };
    return query;
  };
  return {
    addressFilters,
    admin: {
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: authUser },
            error: authError,
          }),
        },
      },
      from: table,
      schema: () => ({ from: table }),
    },
    inserts,
    writes,
  };
}

const synced = {
  address: 'person@example.com',
  created_by: 'user',
  display_name: 'Person',
  id: 'personal',
  sender_name: 'Person',
  type: 'personal',
};

describe('resolvePersonalMailbox', () => {
  it('does not write when identity and ownership are already in place', async () => {
    const { admin, writes } = createAdmin({
      mailbox: synced,
      members: [
        { mailbox_id: 'personal', role: 'owner' },
        { mailbox_id: 'shared', role: 'viewer' },
      ],
    });

    const result = await resolvePersonalMailbox(admin, ctx);

    expect(writes).toEqual([]);
    expect(result.mailbox.id).toBe('personal');
    expect(result.memberRows).toEqual([
      { mailbox_id: 'shared', role: 'viewer' },
      { mailbox_id: 'personal', role: 'owner' },
    ]);
  });

  it('restores missing ownership and includes the mailbox in memberships', async () => {
    const { admin, writes } = createAdmin({ mailbox: synced, members: [] });

    const result = await resolvePersonalMailbox(admin, ctx);

    expect(writes).toEqual(['upsert:mail_mailbox_members']);
    expect(result.memberRows).toEqual([
      { mailbox_id: 'personal', role: 'owner' },
    ]);
  });

  it('synchronizes a stale personal identity', async () => {
    const { admin, writes } = createAdmin({
      mailbox: { ...synced, display_name: 'Old name' },
      members: [{ mailbox_id: 'personal', role: 'owner' }],
    });

    await resolvePersonalMailbox(admin, ctx);

    expect(writes).toEqual(['update:mail_mailboxes']);
  });
});

describe('resolvePersonalMailbox owner authority (SR-926)', () => {
  const forgedCtx = {
    user: { email: 'victim@example.com', id: 'user' },
  } as MailRouteContext;
  const victimMailbox = {
    address: 'victim@example.com',
    created_by: 'victim',
    display_name: 'Victim',
    id: 'victim-personal',
    sender_name: 'Victim',
    type: 'personal',
  };

  it('looks up and keeps only the confirmed Auth mailbox, never the claim email', async () => {
    const { addressFilters, admin, writes } = createAdmin({
      mailbox: synced,
      members: [{ mailbox_id: 'personal', role: 'owner' }],
    });

    const result = await resolvePersonalMailbox(admin, forgedCtx);

    expect(addressFilters).toEqual(['person@example.com']);
    expect(result.mailbox.id).toBe('personal');
    expect(result.ownerAddress).toBe('person@example.com');
    expect(writes).toEqual([]);
  });

  it('creates a missing mailbox only at the confirmed Auth address', async () => {
    const { addressFilters, admin, inserts } = createAdmin({
      mailbox: null,
      members: [],
    });

    await resolvePersonalMailbox(admin, forgedCtx);

    expect(addressFilters).not.toContain('victim@example.com');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      address: 'person@example.com',
      created_by: 'user',
    });
  });

  it('never re-owns or creates the claimed mailbox when Auth email is unconfirmed', async () => {
    const { addressFilters, admin, writes } = createAdmin({
      authUser: {
        ...confirmedAuthUser,
        email: 'victim@example.com',
        email_confirmed_at: null,
      },
      mailbox: victimMailbox,
      members: [],
    });

    await expect(resolvePersonalMailbox(admin, forgedCtx)).rejects.toThrow(
      'A confirmed account email is required for a mailbox'
    );
    expect(addressFilters).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('fails closed without writes when Auth cannot be read', async () => {
    const { admin, writes } = createAdmin({
      authError: { message: 'unavailable' },
      authUser: null,
      mailbox: victimMailbox,
      members: [],
    });

    await expect(resolvePersonalMailbox(admin, forgedCtx)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});

describe('hasSystemLabels', () => {
  const rows = SYSTEM_LABELS.map((label) => ({
    ...label,
    mailbox_id: 'personal',
  }));

  it('accepts a complete canonical set', () => {
    expect(hasSystemLabels(rows, 'personal')).toBe(true);
  });

  it('rejects missing or renamed system labels', () => {
    expect(hasSystemLabels(rows.slice(1), 'personal')).toBe(false);
    expect(
      hasSystemLabels(
        rows.map((row) =>
          row.slug === 'inbox' ? { ...row, name: 'Renamed' } : row
        ),
        'personal'
      )
    ).toBe(false);
    expect(hasSystemLabels(rows, 'other')).toBe(false);
  });
});
