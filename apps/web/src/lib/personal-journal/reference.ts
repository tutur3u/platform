import {
  type JournalEntry,
  type JournalSourceReference,
  journalSourceReferenceSchema,
} from '@tuturuuu/internal-api/personal-journal';
import { z } from 'zod';
import type { JournalScope } from './service';

const authoritySchema = journalSourceReferenceSchema
  .safeExtend({
    consentEnabled: z.literal(true),
    deleted: z.literal(false),
    revoked: z.literal(false),
  })
  .strict();
export type JournalReferenceResult =
  | { qualified: false }
  | { qualified: true; reference: JournalSourceReference };

// The caller supplies a freshly verified personal scope and an authoritative
// consent/deletion/revocation snapshot. Journal content never grants authority.
export function projectJournalReference(
  entry: JournalEntry,
  scope: JournalScope,
  authority: unknown,
  now: string
): JournalReferenceResult {
  const parsed = authoritySchema.safeParse(authority);
  if (!parsed.success) return { qualified: false };
  const value = parsed.data;
  const time = Date.parse(now),
    observed = Date.parse(value.observedAt),
    expires = Date.parse(value.expiresAt);
  if (
    !Number.isFinite(time) ||
    observed > time ||
    time - observed > 60000 ||
    expires <= time ||
    expires - observed > 300000
  )
    return { qualified: false };
  if (
    entry.actorId !== scope.actorId ||
    entry.workspaceId !== scope.workspaceId ||
    value.actorId !== scope.actorId ||
    value.personalWorkspaceId !== scope.workspaceId ||
    value.sourceId !== entry.id ||
    value.sourceVersion !== entry.revision
  )
    return { qualified: false };
  const checked = journalSourceReferenceSchema.strip().safeParse(value);
  return checked.success
    ? { qualified: true, reference: checked.data }
    : { qualified: false };
}
