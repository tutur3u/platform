import { proposeMailGoogleLegalPublication } from './mail-google-revision-2026-11-21';
import { proposeMeetAiLegalPublication } from './meet-ai-revision-2026-11-12';
import type { LegalDocument } from './types';

/** Applies the dated canonical revisions, oldest first, to a baseline document. */
export function proposeCanonicalLegalPublication(
  document: LegalDocument
): LegalDocument {
  return proposeMailGoogleLegalPublication(
    proposeMeetAiLegalPublication(document)
  );
}
