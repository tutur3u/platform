import { describe, expect, it } from 'vitest';
import type { MailRouteContext } from '../types';
import { hasSystemLabels, resolvePersonalMailbox } from './bootstrap-personal';
import { SYSTEM_LABELS } from './shared';

const ctx = {
  user: { email: 'Person@Example.com', id: 'user' },
} as MailRouteContext;

function createAdmin({
  mailbox,
  members,
}: {
  mailbox: Record<string, unknown> | null;
  members: { mailbox_id: string; role: string }[];
}) {
  const writes: string[] = [];
  const table = (name: string) => {
    const rows =
      name === 'users'
        ? { data: [{ display_name: 'Person', id: 'user' }], error: null }
        : { data: members, error: null };
    const query: Record<string, unknown> = {};
    // Filters resolve to the list result and keep the builder chainable.
    const chain = () => Object.assign(Promise.resolve(rows), query);
    for (const method of ['select', 'eq', 'in']) query[method] = chain;
    query.maybeSingle = async () => ({ data: mailbox, error: null });
    query.upsert = async () => {
      writes.push(`upsert:${name}`);
      return { error: null };
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
    admin: { from: table, schema: () => ({ from: table }) },
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
