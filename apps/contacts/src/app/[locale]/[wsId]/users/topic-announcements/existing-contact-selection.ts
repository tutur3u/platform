import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';

export type ExistingContactRejection = 'archived' | 'foreign' | 'missing_email';

export type ExistingContactSelection =
  | { contact: TopicAnnouncementContact; ok: true }
  | { ok: false; reason: ExistingContactRejection };

/**
 * Resolves a picked contact ID against the contacts the current workspace's
 * lookup returned. Anything outside that set (another workspace, a stale
 * result) is foreign; archived or email-less contacts cannot be reused.
 */
export function resolveExistingContactSelection(
  candidates: TopicAnnouncementContact[],
  contactId: string
): ExistingContactSelection {
  const contact = candidates.find((candidate) => candidate.id === contactId);

  if (!contact) return { ok: false, reason: 'foreign' };
  if (contact.archived) return { ok: false, reason: 'archived' };
  if (!contact.email?.trim()) return { ok: false, reason: 'missing_email' };

  return { contact, ok: true };
}

/**
 * The contacts lookup embeds `q` in a PostgREST `or()` filter, where commas and
 * parentheses are clause syntax. Treat them as plain separators instead.
 */
export function sanitizeContactSearch(query: string) {
  return query.replace(/[,()]/gu, ' ').replace(/\s+/gu, ' ').trim();
}
