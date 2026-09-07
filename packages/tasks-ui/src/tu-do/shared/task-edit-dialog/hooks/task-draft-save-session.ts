const savingDrafts = new Set<string>();

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
