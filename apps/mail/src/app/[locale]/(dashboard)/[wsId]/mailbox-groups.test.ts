import type { MailMailbox } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { groupMailboxes } from './mailbox-groups';

const mailbox = (
  id: string,
  address: string,
  type: MailMailbox['type'] = 'shared'
) => ({ address, displayName: id, id, type }) as MailMailbox;

describe('groupMailboxes', () => {
  it('lists personal mailboxes apart from shared groups', () => {
    const result = groupMailboxes(
      [
        mailbox('me', 'me@example.test', 'personal'),
        mailbox('help', 'help@example.test'),
      ],
      'Shared mailboxes'
    );
    expect(result.personal.map((item) => item.id)).toEqual(['me']);
    expect(result.shared).toHaveLength(1);
    expect(result.shared[0]?.label).toBe('Shared mailboxes');
  });

  it('groups siblings that share an address prefix under the prefix', () => {
    const result = groupMailboxes(
      [
        mailbox('a', 'support-eu@example.test'),
        mailbox('b', 'support-us@example.test'),
        mailbox('c', 'billing@example.test'),
      ],
      'Shared mailboxes'
    );
    expect(result.shared.map((group) => group.label)).toEqual([
      'SUPPORT',
      'Shared mailboxes',
    ]);
    expect(result.shared[0]?.mailboxes.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('returns no groups when there are no shared mailboxes', () => {
    expect(
      groupMailboxes([mailbox('me', 'me@example.test', 'personal')], 'Shared')
        .shared
    ).toEqual([]);
  });
});
