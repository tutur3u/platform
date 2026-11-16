import { formatCitation } from '@/lib/cite/format';
import type { CitationStyle } from '@/lib/cite/types';
import type { DraftResult } from './citation-draft';

export type CitationOutput =
  | { kind: 'incomplete' }
  | { kind: 'invalid' }
  | { kind: 'failed' }
  | { kind: 'ready'; reference: string; inText: string };

/** Runs a fresh engine call for the current fields and style; never reuses output. */
export function computeCitationOutput(
  result: DraftResult,
  style: CitationStyle
): CitationOutput {
  if (result.kind !== 'ready') return { kind: result.kind };
  try {
    const { reference, inText } = formatCitation(result.fields, style);
    return { kind: 'ready', reference, inText };
  } catch {
    return { kind: 'failed' };
  }
}
