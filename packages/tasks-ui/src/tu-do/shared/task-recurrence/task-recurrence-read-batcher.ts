import {
  readWorkspaceTaskRecurrence,
  TASK_RECURRENCE_READ_LIMIT,
  type WorkspaceTaskRecurrenceEntry,
} from '@tuturuuu/internal-api/task-recurrence';

type Resolve = (entry: WorkspaceTaskRecurrenceEntry | null) => void;

interface PendingRead {
  waiters: Map<string, Resolve[]>;
}

const pending = new Map<string, PendingRead>();

async function flush(wsId: string) {
  const batch = pending.get(wsId);
  pending.delete(wsId);
  if (!batch) return;
  const ids = [...batch.waiters.keys()];
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += TASK_RECURRENCE_READ_LIMIT)
    chunks.push(ids.slice(start, start + TASK_RECURRENCE_READ_LIMIT));
  await Promise.all(
    chunks.map(async (chunk) => {
      let entries: WorkspaceTaskRecurrenceEntry[] = [];
      try {
        entries = await readWorkspaceTaskRecurrence(wsId, chunk);
      } catch {
        // Badges are decorative; a failed read renders no badge.
      }
      const byTask = new Map(entries.map((entry) => [entry.task_id, entry]));
      for (const id of chunk)
        for (const resolve of batch.waiters.get(id) ?? [])
          resolve(byTask.get(id) ?? null);
    })
  );
}

/** Coalesces the series reads of every card rendered in the same tick into
 * one request per 100 tasks. */
export function loadTaskRecurrenceEntry(
  wsId: string,
  taskId: string
): Promise<WorkspaceTaskRecurrenceEntry | null> {
  return new Promise((resolve) => {
    let batch = pending.get(wsId);
    if (!batch) {
      batch = { waiters: new Map() };
      pending.set(wsId, batch);
      setTimeout(() => void flush(wsId), 10);
    }
    const waiters = batch.waiters.get(taskId) ?? [];
    waiters.push(resolve);
    batch.waiters.set(taskId, waiters);
  });
}
