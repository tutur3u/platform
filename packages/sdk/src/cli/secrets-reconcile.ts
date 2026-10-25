import type { SecretsClient } from './secrets-client';
import type { OperationJournal } from './secrets-journal';

export const MAX_RECONCILE_ENTRIES = 16;

export interface ReconcileReport {
  lines: string[];
  unresolved: number;
}

/**
 * One request.status query per unresolved write, no retries and no new write.
 * Only a server that reports the original request id as found resolves it; a
 * not-found answer, a failure or a mismatch leaves the outcome UNKNOWN.
 */
export async function reconcileWrites(
  client: SecretsClient,
  journal: OperationJournal,
  scope: { workspaceId: string; vaultId: string },
  only?: string
): Promise<ReconcileReport> {
  const entries = (
    await journal.unresolved(scope.workspaceId, scope.vaultId)
  ).filter((entry) => !only || entry.requestId === only);
  if (entries.length === 0)
    return { lines: ['No unresolved writes.'], unresolved: 0 };
  const lines: string[] = [];
  let unresolved = 0;
  for (const entry of entries.slice(0, MAX_RECONCILE_ENTRIES)) {
    const label = `${entry.action}${entry.name ? ` ${entry.name}` : ''} (${entry.requestId})`;
    const result = await client.status(entry.requestId);
    if (
      result.kind === 'ok' &&
      result.value.found &&
      result.value.action === entry.action
    ) {
      await journal.resolve(entry.requestId);
      const detail = [
        result.value.itemId && `item ${result.value.itemId}`,
        result.value.revision && `revision ${result.value.revision}`,
      ].filter(Boolean);
      lines.push(
        `COMMITTED ${label}${detail.length ? `: ${detail.join(', ')}` : ''}`
      );
      continue;
    }
    unresolved += 1;
    const why =
      result.kind === 'ok'
        ? result.value.found
          ? 'the server reported a different action'
          : 'the server has no record of it yet'
        : result.kind === 'rejected'
          ? `status check refused (${result.code})`
          : `status check failed (${result.cause})`;
    lines.push(`UNKNOWN ${label}: ${why}`);
  }
  if (entries.length > MAX_RECONCILE_ENTRIES)
    unresolved += entries.length - MAX_RECONCILE_ENTRIES;
  return { lines, unresolved };
}
