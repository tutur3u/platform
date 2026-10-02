import { v7 } from 'uuid';

/** One ID belongs to one draft/attempt, including retries after a lost response.
 * Starting a new draft explicitly replaces it; render and request dispatch do not. */
export function createCalendarCreationRequests() {
  let draftId: string | undefined;
  const attempts = new WeakMap<object, string>();
  return {
    beginDraft() {
      draftId = v7();
    },
    completeDraft() {
      draftId = undefined;
    },
    forAttempt(event: object, isDraft: boolean) {
      if (isDraft) {
        if (!draftId) draftId = v7();
        return draftId;
      }
      let id = attempts.get(event);
      if (!id) {
        id = v7();
        attempts.set(event, id);
      }
      return id;
    },
  };
}
export const createOptimisticEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `optimistic-${crypto.randomUUID()}`;
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
