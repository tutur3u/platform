import { createHash } from 'node:crypto';

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, ordered(entry)])
    );
  return value;
}
/** Private in-memory comparison only: remote master ETags do not necessarily
 * change when a separate occurrence changes. Never publish/log this snapshot. */
export function providerSnapshotRevision(events: { id?: string | null }[]) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        events
          .slice()
          .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
          .map(ordered)
      )
    )
    .digest('hex');
}
