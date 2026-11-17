import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { z } from 'zod';
import type { PeopleVisibility, PersonCandidate } from './workspace-people';

export const MAX_RESOLVE_EMAILS = 50;

const resolveInputSchema = z
  .object({
    emails: z
      .array(
        z
          .email()
          .max(320)
          .transform((value) => value.toLowerCase())
      )
      .min(1)
      .max(MAX_RESOLVE_EMAILS),
  })
  .strict();

/** Lowercased, de-duplicated addresses, or null for an invalid body. */
export function parsePeopleResolve(body: unknown) {
  const parsed = resolveInputSchema.safeParse(body);
  if (!parsed.success) return null;
  return [...new Set(parsed.data.emails)];
}

/** An exact, case-insensitive PostgREST `ilike` value for one address. */
export function exactEmailPattern(email: string) {
  return `"${email.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll('"', '\\"')}"`;
}

export type ResolvedPerson = {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
} & (
  | { kind: 'member'; id: string; emailVisible: boolean }
  | { kind: 'contact'; id: string; emailVisible: boolean; mailBlocked: boolean }
  | { kind: 'unknown' }
);

/**
 * One row per requested address. Matching follows the same visibility rules
 * as people search: members are matched by email only when the workspace does
 * not hide member emails, and contacts only with private-info access, so the
 * lookup never confirms an address the caller could not have searched for.
 * Members win over contacts for the same address.
 */
export function projectResolvedPeople(
  emails: string[],
  candidates: (PersonCandidate & { mail_blocked?: boolean | null })[],
  visibility: PeopleVisibility
): ResolvedPerson[] {
  const byEmail = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const email = candidate.email?.toLowerCase();
    if (!email) continue;
    const contact = candidate.kind === 'contact';
    // Same rule as people search: contact emails are matchable only with
    // private-info access while the workspace shows emails.
    if (contact && (!visibility.privateContacts || visibility.hideEmail))
      continue;
    if (!contact && visibility.hideEmail) continue;
    const existing = byEmail.get(email);
    if (!existing || (existing.kind === 'contact' && !contact)) {
      byEmail.set(email, candidate);
    }
  }

  return emails.map((email) => {
    const candidate = byEmail.get(email);
    if (!candidate) {
      return { email, kind: 'unknown', displayName: null, avatarUrl: null };
    }
    const contact = candidate.kind === 'contact';
    const showName =
      !visibility.hideName && (!contact || visibility.publicContacts);
    const displayName = showName
      ? resolveUserDisplayName({
          display_name: candidate.display_name,
          full_name: contact ? candidate.full_name : null,
        }) || null
      : null;
    const avatarUrl =
      contact && !visibility.publicContacts ? null : candidate.avatar_url;
    return contact
      ? {
          email,
          kind: 'contact',
          id: candidate.id,
          displayName,
          avatarUrl,
          emailVisible: true,
          mailBlocked: candidate.mail_blocked === true,
        }
      : {
          email,
          kind: 'member',
          id: candidate.id,
          displayName,
          avatarUrl,
          emailVisible: !visibility.hideEmail,
        };
  });
}
