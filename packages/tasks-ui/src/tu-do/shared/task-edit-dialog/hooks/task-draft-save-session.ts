const savingDrafts = new Set<string>();
const pendingDraftSaveCancels = new Map<string, Set<() => void>>();

export function registerPendingTaskDraftSaveCancellation(
  key: string,
  cancel: () => void
) {
  const callbacks = pendingDraftSaveCancels.get(key) ?? new Set();
  callbacks.add(cancel);
  pendingDraftSaveCancels.set(key, callbacks);
  return () => {
    callbacks.delete(cancel);
    if (!callbacks.size) pendingDraftSaveCancels.delete(key);
  };
}

export function cancelPendingTaskDraftSaves(key: string) {
  for (const cancel of pendingDraftSaveCancels.get(key) ?? []) cancel();
}

export function isTaskDraftSaving(key: string) {
  return savingDrafts.has(key);
}

/** Coordinates submit and close handlers that share one board draft. */
export function beginTaskDraftSave(key: string): (() => void) | undefined {
  if (savingDrafts.has(key)) return undefined;
  savingDrafts.add(key);
  return () => {
    savingDrafts.delete(key);
  };
}
