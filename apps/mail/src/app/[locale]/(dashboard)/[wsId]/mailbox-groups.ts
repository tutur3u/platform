import type { MailMailbox } from '@tuturuuu/internal-api';

export interface MailboxGroup {
  label: string;
  mailboxes: MailMailbox[];
}

/**
 * Personal mailboxes stand alone. Shared mailboxes whose address local part
 * shares a `prefix-` with a sibling form a group named after the prefix; the
 * rest fall under the fallback label.
 */
export function groupMailboxes(
  mailboxes: MailMailbox[],
  fallbackLabel: string
): { personal: MailMailbox[]; shared: MailboxGroup[] } {
  const personal = mailboxes.filter((mailbox) => mailbox.type === 'personal');
  const prefixes = new Map<string, MailMailbox[]>();
  for (const mailbox of mailboxes) {
    if (mailbox.type === 'personal') continue;
    const [local = '', domain = ''] = mailbox.address.split('@');
    const prefix = local.includes('-') ? local.split('-')[0] : '';
    const key = prefix ? `${prefix}@${domain}` : domain;
    prefixes.set(key, [...(prefixes.get(key) ?? []), mailbox]);
  }
  const groups = new Map<string, MailMailbox[]>();
  for (const [key, members] of prefixes) {
    const label =
      members.length > 1 && key.includes('@')
        ? (key.split('@')[0] ?? '').toUpperCase()
        : fallbackLabel;
    groups.set(label, [...(groups.get(label) ?? []), ...members]);
  }
  return {
    personal,
    shared: [...groups].map(([label, members]) => ({
      label,
      mailboxes: members,
    })),
  };
}
