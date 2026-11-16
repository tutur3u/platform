import { CiteWorkSchema, type CiteWork } from '@tuturuuu/cite';
import { z } from 'zod';
import type {
  CitationFixProposal,
  CitationFixRequest,
  IdentifierField,
} from './contracts';

const identifierFields: readonly IdentifierField[] = [
  'doi',
  'isbn',
  'arxivId',
  'pmid',
];

function suppliedIdentifier(
  field: IdentifierField,
  identifier: string,
  input: string
) {
  if (field === 'isbn')
    return input
      .replace(/[\s-]/g, '')
      .toUpperCase()
      .includes(identifier.toUpperCase());
  if (field === 'pmid')
    return new RegExp(
      `(?:pmid\\s*:?\\s*|pubmed\\.ncbi\\.nlm\\.nih\\.gov/)${identifier}(?:\\b|/)`,
      'i'
    ).test(input);
  return input.toLowerCase().includes(identifier.toLowerCase());
}

/** Proposed identifiers become usable only after a bounded registry lookup confirms them. */
export async function prepareCitationFixProposal(
  value: unknown,
  input: CitationFixRequest,
  ground: (identifier: string, signal: AbortSignal) => Promise<CiteWork | null>,
  signal: AbortSignal,
  now: number
): Promise<CitationFixProposal | null> {
  const object = z.record(z.string(), z.unknown()).safeParse(value);
  if (!object.success) return null;
  const provenance = {
    sourceCaptureMethod: 'ai_parsed',
    verificationStatus: 'ai_inferred',
    capturedAt: new Date(now).toISOString(),
  };
  const parsed = CiteWorkSchema.safeParse({
    ...object.data,
    id: input.existingWork?.id ?? `cite-ai:${input.operationId}`,
    provenance,
  });
  if (!parsed.success) return null;
  const work: CiteWork = parsed.data;
  const grounding: CitationFixProposal['grounding'] = [];
  let reads = 0;
  for (const field of identifierFields) {
    const identifier = work[field];
    if (!identifier || identifier === input.existingWork?.[field]) continue;
    if (
      !suppliedIdentifier(field, identifier, input.input) ||
      reads === 2 ||
      signal.aborted
    ) {
      delete work[field];
      grounding.push({ field, status: 'not_checked' });
      continue;
    }
    reads += 1;
    let verified: CiteWork | null = null;
    try {
      verified = await ground(
        field === 'isbn'
          ? `ISBN:${identifier}`
          : field === 'arxivId'
            ? `arXiv:${identifier}`
            : field === 'pmid'
              ? `PMID:${identifier}`
              : identifier,
        signal
      );
    } catch {
      /* Failed source reads leave a reviewable proposal without inferred identifiers. */
    }
    if (
      verified?.[field] === identifier &&
      verified.provenance.verificationStatus === 'verified_registry'
    )
      grounding.push({ field, status: 'verified' });
    else {
      delete work[field];
      grounding.push({ field, status: 'unverified' });
    }
  }
  const removedFields = grounding
    .filter((entry) => entry.status !== 'verified')
    .map((entry) => entry.field);
  const uncertain = new Set<string>(removedFields);
  if (
    work.url &&
    work.url !== input.existingWork?.url &&
    !input.input.includes(work.url)
  ) {
    delete work.url;
    uncertain.add('url');
  }
  if (new TextEncoder().encode(JSON.stringify(work)).byteLength > 60000)
    return null;
  const keys = new Set([
    ...Object.keys(input.existingWork ?? {}),
    ...Object.keys(work),
  ]);
  const changes = [...keys]
    .filter(
      (key) =>
        key !== 'id' &&
        key !== 'provenance' &&
        JSON.stringify(Reflect.get(input.existingWork ?? {}, key)) !==
          JSON.stringify(Reflect.get(work, key))
    )
    .sort();
  const verified = new Set<string>(
    grounding
      .filter((entry) => entry.status === 'verified')
      .map((entry) => entry.field)
  );
  for (const field of changes) if (!verified.has(field)) uncertain.add(field);
  return {
    work,
    changes,
    uncertainFields: [...uncertain].sort(),
    grounding,
    needsReview: true,
  };
}
