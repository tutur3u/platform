import { v7 } from 'uuid';

export const newCalendarCreationRequestId = () => v7();
/** Explicit draft IDs survive retries. Independent calls receive separate IDs;
 * changed intent after an uncertain response must start an explicit new draft. */
export function createCalendarCreationRequests() {
  const intents = new Map<string, string>();
  return {
    forAttempt(event: object, requestId?: string) {
      const id = requestId ?? v7();
      const intent = JSON.stringify(event, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]])
            )
          : value
      );
      const previous = intents.get(id);
      if (previous !== undefined && previous !== intent)
        throw new Error(
          'This calendar draft changed after submission; recover it before starting a new draft'
        );
      if (requestId) intents.set(id, intent);
      return id;
    },
  };
}
export const createOptimisticEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `optimistic-${crypto.randomUUID()}`;
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
