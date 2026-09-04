type SnapshotRecord = Record<string, unknown>;

type HistoryEntrySnapshotContext = {
  change_type?: string | null;
  field_name?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  metadata?: unknown;
};

type RelationshipSnapshot = {
  assignees?: SnapshotRecord[];
  labels?: SnapshotRecord[];
  projects?: SnapshotRecord[];
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

function getRecordIdentifier(value: unknown, keys: string[]): string | null {
  const record = getMetadataRecord(value);
  if (!record) return null;

  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key];
  }

  return null;
}

function removeRelationship(
  items: SnapshotRecord[],
  identifier: string | null,
  keys: string[]
) {
  if (!identifier) return items;
  return items.filter((item) => getRecordIdentifier(item, keys) !== identifier);
}

function restoreRelationship(
  items: SnapshotRecord[],
  value: unknown,
  keys: string[]
) {
  const record = getMetadataRecord(value);
  const identifier = getRecordIdentifier(record, keys);
  if (!record || !identifier) return items;
  if (items.some((item) => getRecordIdentifier(item, keys) === identifier)) {
    return items;
  }
  return [...items, record];
}

/**
 * Relationship snapshot RPCs also return the state immediately after the
 * selected event. Reverse that event so the preview and restore transaction
 * target the same exact version.
 */
export function getRelationshipsBeforeSelectedChange(
  relationships: RelationshipSnapshot | null,
  historyEntry: HistoryEntrySnapshotContext | null
): RelationshipSnapshot {
  const current = relationships ?? {};
  const metadata = getMetadataRecord(historyEntry?.metadata);

  switch (historyEntry?.change_type) {
    case 'assignee_added': {
      const identifier =
        getRecordIdentifier(historyEntry.new_value, ['user_id', 'id']) ??
        getRecordIdentifier(metadata, ['user_id']);
      return {
        ...current,
        assignees: removeRelationship(current.assignees ?? [], identifier, [
          'user_id',
          'id',
        ]),
      };
    }
    case 'assignee_removed':
      return {
        ...current,
        assignees: restoreRelationship(
          current.assignees ?? [],
          historyEntry.old_value,
          ['user_id', 'id']
        ),
      };
    case 'label_added': {
      const identifier =
        getRecordIdentifier(historyEntry.new_value, ['id']) ??
        getRecordIdentifier(metadata, ['label_id']);
      return {
        ...current,
        labels: removeRelationship(current.labels ?? [], identifier, ['id']),
      };
    }
    case 'label_removed':
      return {
        ...current,
        labels: restoreRelationship(
          current.labels ?? [],
          historyEntry.old_value,
          ['id']
        ),
      };
    case 'project_linked': {
      const identifier =
        getRecordIdentifier(historyEntry.new_value, ['id', 'project_id']) ??
        getRecordIdentifier(metadata, ['project_id']);
      return {
        ...current,
        projects: removeRelationship(current.projects ?? [], identifier, [
          'id',
          'project_id',
        ]),
      };
    }
    case 'project_unlinked':
      return {
        ...current,
        projects: restoreRelationship(
          current.projects ?? [],
          historyEntry.old_value,
          ['id', 'project_id']
        ),
      };
    default:
      return current;
  }
}
