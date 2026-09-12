/** Per-turn protection: an identical task creation must never insert twice. */
export function createTaskWriteGuard() {
  const pending = new Map<string, Promise<unknown>>();
  return async (
    workspaceId: string,
    args: Record<string, unknown>,
    execute: () => Promise<unknown>
  ) => {
    const key = JSON.stringify([
      workspaceId,
      Object.entries(args).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    const previous = pending.get(key);
    if (previous) {
      const result = await previous;
      return {
        ...(result && typeof result === 'object' ? result : { result }),
        reusedResult: true,
        instruction:
          'This is the prior creation result. No second task was created. Explain the saved result or error and stop retrying creation.',
      };
    }
    const result = execute();
    pending.set(key, result);
    return result;
  };
}
