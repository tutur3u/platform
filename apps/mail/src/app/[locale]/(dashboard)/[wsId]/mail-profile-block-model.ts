import type { MailMailboxRole } from '@tuturuuu/internal-api';
import {
  normalizeSenderBlock,
  SHARED_PROVIDER_DOMAINS,
  senderDomain,
} from '@/lib/mail/sender-blocks/match';

export type ProfileBlockOptions = {
  address: string;
  domain: { value: string; disabledReason: 'shared_provider' | null } | null;
};

/** Mailbox owners and admins manage the sender block list. */
export function canManageSenderBlocks(
  role: MailMailboxRole | null | undefined
) {
  return role === 'owner' || role === 'admin';
}

/**
 * Block choices the profile card offers for a sender, or null when the
 * viewer cannot block in this mailbox or the address is not blockable.
 */
export function profileBlockOptions(
  role: MailMailboxRole | null | undefined,
  address: string
): ProfileBlockOptions | null {
  if (!canManageSenderBlocks(role)) return null;
  const rule = normalizeSenderBlock('address', address);
  if (!rule) return null;
  const domain = senderDomain(rule.value);
  return {
    address: rule.value,
    domain: domain
      ? {
          value: domain,
          disabledReason: SHARED_PROVIDER_DOMAINS.has(domain)
            ? 'shared_provider'
            : null,
        }
      : null,
  };
}
