import { CiteWorkSchema } from '@tuturuuu/cite';
import type {
  CitationCandidate,
  CitationCapture,
  CitationResult,
} from '@tuturuuu/ui/text-editor/citation';
import { toLookupErrorCode } from '../../../../../cite/citation-draft';
import { summarizeWork } from './document-citation-adapter';

const MAX_CANDIDATES = 3;

function candidate(work: unknown): CitationCandidate | null {
  const parsed = CiteWorkSchema.safeParse(work);
  return parsed.success
    ? { work: parsed.data, summary: summarizeWork(parsed.data) }
    : null;
}

/**
 * Maps the capture wire union. Only `captured` and `candidates` carry canonical
 * works, and each is re-validated here; `manual` stays an incomplete draft so no
 * title or field is ever invented to satisfy the schema.
 */
export function mapCaptureResponse(
  response: unknown
): CitationResult<CitationCapture> {
  if (typeof response !== 'object' || response === null) {
    return { status: 'error', code: 'INVALID_RESPONSE' };
  }
  const body = response as Record<string, unknown>;
  switch (body.kind) {
    case 'captured': {
      const parsed = candidate(body.work);
      return parsed
        ? { status: 'ok', data: { kind: 'captured', candidate: parsed } }
        : {
            status: 'ok',
            data: { kind: 'manual', draft: body.fields ?? null },
          };
    }
    case 'candidates': {
      const list = Array.isArray(body.candidates)
        ? body.candidates
            .slice(0, MAX_CANDIDATES)
            .map(candidate)
            .filter((entry): entry is CitationCandidate => entry !== null)
        : [];
      return list.length
        ? { status: 'ok', data: { kind: 'candidates', candidates: list } }
        : { status: 'error', code: 'NOT_FOUND' };
    }
    case 'manual':
      return {
        status: 'ok',
        data: { kind: 'manual', draft: body.fields ?? null },
      };
    default:
      return { status: 'error', code: 'INVALID_RESPONSE' };
  }
}

export function mapCaptureError(error: unknown): CitationResult<never> {
  const code = toLookupErrorCode(error);
  return code === 'LOOKUP_UNAVAILABLE'
    ? { status: 'unavailable', reason: 'not_provisioned' }
    : { status: 'error', code };
}
