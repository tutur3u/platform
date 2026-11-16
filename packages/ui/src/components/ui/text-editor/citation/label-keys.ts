import type { CitationRecovery, CitationResult } from './types';

/** Validation fields with their own label; anything else reads as `other`. */
export const CITATION_ISSUE_FIELDS = [
  'authors',
  'issued',
  'containerTitle',
  'publisher',
  'publisherPlace',
  'url',
  'accessed',
  'modelName',
  'indigenous',
  'provenance',
] as const;
export type CitationIssueField =
  | (typeof CITATION_ISSUE_FIELDS)[number]
  | 'other';

export function citationIssueField(field: string): CitationIssueField {
  const head = field === 'aiGenerated.modelName' ? 'modelName' : field;
  return (CITATION_ISSUE_FIELDS as readonly string[]).includes(head)
    ? (head as CitationIssueField)
    : 'other';
}

export type CitationRepairFailureKind =
  | 'creditsExhausted'
  | 'notAllowed'
  | 'unavailable'
  | 'billingPending'
  | 'inProgress'
  | 'chargedInvalid'
  | 'offline'
  | 'expired'
  | 'generic';

/**
 * How a failed repair continues. `same` resends the same operation id and input
 * (settlement unknown or not started); `new` needs a fresh id because the old
 * one was charged or expired.
 */
export interface CitationRepairFailure {
  kind: CitationRepairFailureKind;
  retry: 'same' | 'new' | 'none';
}

export function classifyRepairFailure(
  result: Exclude<CitationResult<unknown>, { status: 'ok' }> | null
): CitationRepairFailure {
  if (!result) return { kind: 'generic', retry: 'same' };
  if (result.status === 'unavailable') {
    switch (result.reason) {
      case 'insufficient_credits':
        return { kind: 'creditsExhausted', retry: 'new' };
      case 'forbidden':
        return { kind: 'notAllowed', retry: 'none' };
      case 'offline':
        return { kind: 'offline', retry: 'same' };
      case 'not_provisioned':
        return { kind: 'unavailable', retry: 'same' };
      default: {
        const exhaustive: never = result.reason;
        return exhaustive;
      }
    }
  }
  if (result.code === 'BILLING_PENDING' || result.billing === 'unknown') {
    return { kind: 'billingPending', retry: 'same' };
  }
  if (result.code === 'INVALID_AI_OUTPUT' || result.billing === 'settled') {
    return { kind: 'chargedInvalid', retry: 'new' };
  }
  switch (result.code) {
    case 'CREDITS_EXHAUSTED':
    case 'INSUFFICIENT_CREDITS':
      return { kind: 'creditsExhausted', retry: 'new' };
    case 'FEATURE_NOT_ALLOWED':
      return { kind: 'notAllowed', retry: 'none' };
    case 'CREDIT_CHECK_FAILED':
      return { kind: 'unavailable', retry: 'new' };
    case 'AI_UNAVAILABLE':
      return { kind: 'unavailable', retry: 'same' };
    case 'GENERATION_IN_PROGRESS':
      return { kind: 'inProgress', retry: 'same' };
    case 'OPERATION_EXPIRED':
    case 'OPERATION_CONFLICT':
      return { kind: 'expired', retry: 'new' };
    default:
      return { kind: 'generic', retry: 'same' };
  }
}

/** Recovery states that underline the citation for attention. */
export const RECOVERY_ATTENTION: ReadonlySet<CitationRecovery['kind']> =
  new Set(['invalid', 'detached', 'update-available']);
