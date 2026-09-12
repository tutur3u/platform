const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const dateKey = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

/** Per-turn protection, retaining receipts whenever a write may have happened. */
export function createTaskWriteGuard() {
  const pending = new Map<string, Promise<unknown>>();
  return async (
    workspaceId: string,
    args: Record<string, unknown>,
    execute: () => Promise<unknown>
  ) => {
    const { dueDate, ...fields } = args;
    const normalized = {
      ...fields,
      description: args.description || null,
      priority: args.priority ?? null,
      startDate: dateKey(args.startDate),
      endDate: dateKey(args.endDate ?? dueDate),
      estimationPoints: args.estimationPoints ?? null,
      assignToSelf: args.assignToSelf !== false,
    };
    const key = JSON.stringify([
      workspaceId,
      Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    const previous = pending.get(key);
    if (previous) {
      const result = await previous;
      return {
        ...(object(result) ? result : { result }),
        reusedResult: true,
        instruction:
          'This is the prior creation result. No second task was created. Explain the saved result or error and stop retrying creation.',
      };
    }
    const result = Promise.resolve()
      .then(execute)
      .catch(() => ({
        success: false,
        writeUncertain: true,
        error:
          'Task creation was interrupted. Verify the saved task before retrying.',
      }));
    pending.set(key, result);
    const output = await result;
    // Only an explicit pre-write failure is safe to retry. A transport failure
    // may occur after insertion and must retain its recovery receipt.
    if (
      object(output) &&
      output.created === false &&
      output.writeUncertain !== true
    )
      pending.delete(key);
    return output;
  };
}
