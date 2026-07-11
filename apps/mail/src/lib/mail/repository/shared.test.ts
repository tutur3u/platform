import { describe, expect, it } from 'vitest';
import { toMailbox } from './shared';

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
