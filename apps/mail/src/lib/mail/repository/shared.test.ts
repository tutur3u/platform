import { describe, expect, it } from 'vitest';
import { toLabel, toMailbox } from './shared';

describe('toMailbox', () => {
  const baseMailbox = {
    address: 'phucvo@tuturuuu.com',
    display_name: 'Legacy mailbox name',
    domain_id: 'domain-id',
    id: 'mailbox-id',
    sender_name: 'Custom sender override',
    status: 'active',
    type: 'personal',
  };

  it('uses the canonical Tuturuuu user display name for personal mailboxes', () => {
    const mailbox = toMailbox(baseMailbox, 'owner', 'Võ Hoàng Phúc');

    expect(mailbox.displayName).toBe('Võ Hoàng Phúc');
    expect(mailbox.senderName).toBe('Võ Hoàng Phúc');
  });

  it('does not reuse a stale stored sender name for a personal mailbox', () => {
    const mailbox = toMailbox(baseMailbox, 'owner');

    expect(mailbox.displayName).toBe('phucvo@tuturuuu.com');
    expect(mailbox.senderName).toBe('phucvo@tuturuuu.com');
  });

  it('preserves configured identity for shared mailboxes', () => {
    const mailbox = toMailbox(
      { ...baseMailbox, type: 'shared' },
      'owner',
      'Ignored user name'
    );

    expect(mailbox.displayName).toBe('Legacy mailbox name');
    expect(mailbox.senderName).toBe('Custom sender override');
  });
});

describe('toLabel', () => {
  it('defaults additive smart-label fields safely before migration rollout', () => {
    expect(
      toLabel({
        color: null,
        id: 'label-id',
        kind: 'custom',
        mailbox_id: 'mailbox-id',
        name: 'Invoices',
        slug: 'invoices',
      })
    ).toMatchObject({
      aiAutoApply: false,
      aiEnabled: false,
      aiInstructions: '',
      description: '',
    });
  });
});

describe('group message privacy', () => {
  it.each(['select', 'update', 'delete'] as const)(
    'scopes %s to the author',
    async (operation) => {
      const { mailMessageTable } = await import('./shared');
      const calls: unknown[] = [];
      const builder = {
        eq: (key: string, value: string) => {
          calls.push([key, value]);
          return builder;
        },
      };
      const table = Object.fromEntries(
        ['select', 'update', 'delete'].map((key) => [key, () => builder])
      );
      const admin = { schema: () => ({ from: () => table }) };
      mailMessageTable(
        { admin, mailbox: { groupPolicy: {} } },
        { user: { id: 'author' } }
      )[operation]();
      expect(calls).toEqual([['created_by', 'author']]);
      expect(
        mailMessageTable({ admin, mailbox: {} }, { user: { id: 'author' } })
      ).toBe(table);
    }
  );
});
