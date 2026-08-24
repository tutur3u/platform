type SnapshotRecord = Record<string, unknown>;

type HistoryEntrySnapshotContext = {
  change_type?: string | null;
  field_name?: string | null;
  old_value?: unknown;
  metadata?: unknown;
};

const SNAPSHOT_CORE_FIELDS = new Set([
  'name',
  'description',
  'priority',
  'start_date',
  'end_date',
  'estimation_points',
  'list_id',
  'completed',
]);

function getMetadataRecord(metadata: unknown): SnapshotRecord | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as SnapshotRecord;
}

/**
 * The snapshot RPC reconstructs the task immediately after the selected row.
 * A history preview describes that row's change, so compare against the state
 * immediately before it by applying the selected field's recorded old value.
 */
export function getSnapshotBeforeSelectedChange(
  snapshot: SnapshotRecord | null,
  historyEntry: HistoryEntrySnapshotContext | null
): SnapshotRecord | null {
  if (
    !snapshot ||
    historyEntry?.change_type !== 'field_updated' ||
    !historyEntry.field_name ||
    !SNAPSHOT_CORE_FIELDS.has(historyEntry.field_name)
  ) {
    return snapshot;
  }

  const previousSnapshot = {
    ...snapshot,
    [historyEntry.field_name]: historyEntry.old_value ?? null,
  };

  if (historyEntry.field_name === 'list_id') {
    const metadata = getMetadataRecord(historyEntry.metadata);
    const previousListName = metadata?.old_list_name;

    if (typeof previousListName === 'string') {
      previousSnapshot.list_name = previousListName;
    }
  }

  return previousSnapshot;
}
