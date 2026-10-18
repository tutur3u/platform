import {
  type JournalDocument,
  type JournalSourceReference,
  journalDocumentFromEntry,
  journalEntrySchema,
  journalSourceReferenceSchema,
} from '@tuturuuu/internal-api/personal-journal';
import { z } from 'zod';

const scopeSchema = z
  .object({
    actorId: z.guid(),
    personalWorkspaceId: z.guid(),
  })
  .strict();
const authoritySchema = journalSourceReferenceSchema
  .safeExtend({
    freshActor: z.literal(true),
    personalOwnerMember: z.literal(true),
    consentEnabled: z.literal(true),
    deleted: z.literal(false),
    revoked: z.literal(false),
  })
  .strict();
export type JournalContextScope = Readonly<z.infer<typeof scopeSchema>>;

export interface QualifiedJournalContextReader {
  authority(
    scope: JournalContextScope,
    source: Readonly<JournalSourceReference>
  ): Promise<unknown>;
  readOriginal(
    scope: JournalContextScope,
    source: Readonly<JournalSourceReference>
  ): Promise<unknown>;
}
export type OriginalJournalFact = {
  kind: 'user_fact';
  provenance: Readonly<JournalSourceReference>;
  original: JournalDocument;
};
export type JournalContextReadResult =
  | {
      qualified: false;
      reason:
        | 'unavailable'
        | 'invalid_reference'
        | 'scope_denied'
        | 'authority_denied'
        | 'source_changed';
    }
  | {
      qualified: true;
      facts: readonly [OriginalJournalFact];
      aiSuggestions: readonly [];
    };

function fresh(value: JournalSourceReference, now: string) {
  const clock = z.iso.datetime({ precision: 3 }).safeParse(now);
  if (!clock.success) return false;
  const time = Date.parse(clock.data),
    observed = Date.parse(value.observedAt),
    expires = Date.parse(value.expiresAt);
  return (
    observed <= time &&
    time - observed <= 60000 &&
    time < expires &&
    expires - observed <= 300000
  );
}

// Reads are injected and unavailable by default. No registry, collection setting,
// embedding/index, memory mutation, scheduler or framework API is called here.
export async function readOriginalJournalContext({
  scope,
  reference,
  reader,
  now = () => new Date().toISOString(),
}: {
  scope: JournalContextScope;
  reference: unknown;
  reader?: QualifiedJournalContextReader;
  now?: () => string;
}): Promise<JournalContextReadResult> {
  const parsed = journalSourceReferenceSchema.safeParse(reference);
  if (!parsed.success) return { qualified: false, reason: 'invalid_reference' };
  const actor = scopeSchema.safeParse(scope);
  if (
    !actor.success ||
    parsed.data.actorId !== actor.data.actorId ||
    parsed.data.personalWorkspaceId !== actor.data.personalWorkspaceId
  )
    return { qualified: false, reason: 'scope_denied' };
  if (!reader) return { qualified: false, reason: 'unavailable' };
  const source = Object.freeze(parsed.data);
  const actorScope = Object.freeze(actor.data);
  const qualifiedReader = reader;
  async function qualifiedAuthority() {
    const checked = authoritySchema.safeParse(
      await qualifiedReader.authority(actorScope, source)
    );
    const clock = now();
    if (
      !checked.success ||
      !fresh(source, clock) ||
      !fresh(checked.data, clock)
    )
      return false;
    const authority = checked.data;
    return (
      authority.actorId === actorScope.actorId &&
      authority.personalWorkspaceId === actorScope.personalWorkspaceId &&
      authority.sourceId === source.sourceId &&
      authority.sourceVersion === source.sourceVersion &&
      authority.consentVersion === source.consentVersion &&
      authority.revocationVersion === source.revocationVersion &&
      authority.deletionVersion === source.deletionVersion
    );
  }
  try {
    if (!(await qualifiedAuthority()))
      return { qualified: false, reason: 'authority_denied' };
    const original = journalEntrySchema.safeParse(
      await qualifiedReader.readOriginal(actorScope, source)
    );
    if (
      !original.success ||
      original.data.actorId !== actorScope.actorId ||
      original.data.workspaceId !== actorScope.personalWorkspaceId ||
      original.data.id !== source.sourceId ||
      original.data.revision !== source.sourceVersion
    )
      return { qualified: false, reason: 'source_changed' };
    // An awaited read is not authority to emit after consent, scope or source
    // versions changed. Originals stay untrusted context, never action authority.
    if (!(await qualifiedAuthority()))
      return { qualified: false, reason: 'authority_denied' };
    return {
      qualified: true,
      facts: [
        {
          kind: 'user_fact',
          provenance: source,
          original: journalDocumentFromEntry(original.data),
        },
      ],
      aiSuggestions: [],
    };
  } catch {
    return { qualified: false, reason: 'unavailable' };
  }
}
