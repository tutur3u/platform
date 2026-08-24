type TerminalMutation = () => Promise<void>;

const taskQueues = new Map<string, Promise<void>>();
const latestIntentIds = new Map<string, string>();
const pendingIntentCounts = new Map<string, number>();
let intentSequence = 0;

export function beginTaskTerminalIntent(taskId: string): string {
  const intentId = `task-terminal-${Date.now()}-${++intentSequence}`;
  latestIntentIds.set(taskId, intentId);
  pendingIntentCounts.set(taskId, (pendingIntentCounts.get(taskId) ?? 0) + 1);
  return intentId;
}

export function isLatestTaskTerminalIntent(
  taskId: string,
  intentId: string
): boolean {
  return latestIntentIds.get(taskId) === intentId;
}

export function hasPendingTaskTerminalIntent(taskId: string): boolean {
  return (pendingIntentCounts.get(taskId) ?? 0) > 0;
}

export function enqueueTaskTerminalMutation(
  taskId: string,
  mutation: TerminalMutation
): Promise<void> {
  const previous = taskQueues.get(taskId) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(mutation);
  taskQueues.set(taskId, queued);

  return queued.finally(() => {
    if (taskQueues.get(taskId) === queued) {
      taskQueues.delete(taskId);
    }
  });
}

export function finishTaskTerminalIntent(taskId: string, intentId: string) {
  const nextCount = Math.max(0, (pendingIntentCounts.get(taskId) ?? 1) - 1);
  if (nextCount === 0) {
    pendingIntentCounts.delete(taskId);
    if (latestIntentIds.get(taskId) === intentId) {
      latestIntentIds.delete(taskId);
    }
    return;
  }

  pendingIntentCounts.set(taskId, nextCount);
}

export function resetTaskTerminalMutationQueueForTests() {
  taskQueues.clear();
  latestIntentIds.clear();
  pendingIntentCounts.clear();
  intentSequence = 0;
}
