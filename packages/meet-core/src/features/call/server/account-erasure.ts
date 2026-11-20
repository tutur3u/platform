export type AccountPresence = 'absent' | 'present' | 'unknown';
export type AccountDeleteOutcome = 'deleted' | 'refused' | 'unknown';
export type AccountErasureDecision = 'confirm' | 'cancel' | 'pending';

const DEFINITIVE_REFUSAL = new Set([400, 401, 403, 422]);

/** 404, timeout, and 5xx are not a refusal. The account may still exist. */
export function classifyAccountDelete(
  error: { status?: number } | null
): AccountDeleteOutcome {
  if (!error) return 'deleted';
  if (error.status !== undefined && DEFINITIVE_REFUSAL.has(error.status))
    return 'refused';
  return 'unknown';
}

/**
 * An absent account confirms the intent. Unknown lookups stay pending.
 * A live account cancels the intent only after a definitive refusal.
 */
export function reconcileAccountErasure(
  presence: AccountPresence,
  outcome: AccountDeleteOutcome
): AccountErasureDecision {
  if (presence === 'absent') return 'confirm';
  if (presence === 'unknown') return 'pending';
  if (outcome === 'refused') return 'cancel';
  return 'pending';
}
