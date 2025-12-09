import type { JSONContent } from '@tiptap/react';

/** Priority type matching the codebase convention */
export type TaskPriorityType = 'critical' | 'high' | 'normal' | 'low';

/** Icon component type (generic to avoid lucide-react dependency) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = React.ComponentType<any>;

/** Snapshot of a task at a point in history */
export interface TaskSnapshot {
  id: string;
  name: string;
  description: string | JSONContent | null;
  priority: TaskPriorityType | null;
  start_date: string | null;
  end_date: string | null;
  estimation_points: number | null;
  list_id: string;
  list_name?: string | null;
  completed: boolean;
  assignees: SnapshotAssignee[];
  labels: SnapshotLabel[];
  projects: SnapshotProject[];
}

export interface SnapshotAssignee {
  id: string;
  user_id?: string;
  display_name: string | null;
  avatar_url?: string | null;
}

export interface SnapshotLabel {
  id: string;
  name: string;
  color?: string | null;
}

export interface SnapshotProject {
  id: string;
  name: string;
}

/** Current task state for comparison */
export interface CurrentTaskState {
  id: string;
  name: string;
  description: string | JSONContent | null;
  priority: TaskPriorityType | null;
  start_date: string | null;
  end_date: string | null;
  estimation_points: number | null;
  list_id: string;
  list_name?: string | null;
  completed: boolean;
  assignees?: Array<{ id?: string; user_id?: string }>;
  labels?: Array<{ id: string }>;
  projects?: Array<{ id: string }>;
}

/** Field that can be compared and reverted */
export type ComparableField =
  | 'name'
  | 'description'
  | 'priority'
  | 'start_date'
  | 'end_date'
  | 'estimation_points'
  | 'list_id'
  | 'completed'
  | 'assignees'
  | 'labels'
  | 'projects';

export const ALL_COMPARABLE_FIELDS: ComparableField[] = [
  'name',
  'description',
  'priority',
  'start_date',
  'end_date',
  'estimation_points',
  'list_id',
  'completed',
  'assignees',
  'labels',
  'projects',
];

/** Field display configuration */
export interface FieldDisplayInfo {
  label: string;
  icon: IconComponent;
  category: 'core' | 'dates' | 'relationships';
}

/**
 * Deep compare two JSON content objects for equality
 */
export function isDescriptionEqual(
  a: string | JSONContent | null | undefined,
  b: string | JSONContent | null | undefined
): boolean {
  // Both null/undefined
  if (!a && !b) return true;
  // One is null/undefined
  if (!a || !b) return false;

  // Convert strings to objects if needed
  const objA = typeof a === 'string' ? tryParseJson(a) : a;
  const objB = typeof b === 'string' ? tryParseJson(b) : b;

  // If parsing failed, compare as strings
  if (objA === null || objB === null) {
    return String(a) === String(b);
  }

  // Deep comparison
  return JSON.stringify(objA) === JSON.stringify(objB);
}

/**
 * Try to parse a JSON string, return null if invalid
 */
function tryParseJson(str: string): JSONContent | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Compare two arrays by extracting IDs
 */
function arraysEqualById(
  a: Array<{ id: string }> | undefined,
  b: Array<{ id: string }> | undefined
): boolean {
  const aIds = new Set((a || []).map((item) => item.id));
  const bIds = new Set((b || []).map((item) => item.id));

  if (aIds.size !== bIds.size) return false;

  for (const id of aIds) {
    if (!bIds.has(id)) return false;
  }

  return true;
}

/**
 * Compare snapshot with current task state and return changed fields
 */
export function getChangedFields(
  snapshot: TaskSnapshot,
  current: CurrentTaskState
): ComparableField[] {
  const changedFields: ComparableField[] = [];

  // Core text field
  if (snapshot.name !== current.name) {
    changedFields.push('name');
  }

  // Description (deep comparison)
  if (!isDescriptionEqual(snapshot.description, current.description)) {
    changedFields.push('description');
  }

  // Priority
  if (snapshot.priority !== current.priority) {
    changedFields.push('priority');
  }

  // Dates
  if (
    normalizeDate(snapshot.start_date) !== normalizeDate(current.start_date)
  ) {
    changedFields.push('start_date');
  }
  if (normalizeDate(snapshot.end_date) !== normalizeDate(current.end_date)) {
    changedFields.push('end_date');
  }

  // Estimation points
  if (snapshot.estimation_points !== current.estimation_points) {
    changedFields.push('estimation_points');
  }

  // List/status
  if (snapshot.list_id !== current.list_id) {
    changedFields.push('list_id');
  }

  // Completed status
  if (snapshot.completed !== current.completed) {
    changedFields.push('completed');
  }

  // Relationships
  const snapshotAssigneeIds =
    snapshot.assignees?.map((a) => ({ id: a.user_id || a.id })) || [];
  const currentAssigneeIds =
    current.assignees?.map((a) => ({ id: a.user_id || a.id || '' })) || [];
  if (!arraysEqualById(snapshotAssigneeIds, currentAssigneeIds)) {
    changedFields.push('assignees');
  }

  if (!arraysEqualById(snapshot.labels, current.labels)) {
    changedFields.push('labels');
  }

  if (!arraysEqualById(snapshot.projects, current.projects)) {
    changedFields.push('projects');
  }

  return changedFields;
}

/**
 * Normalize date string for comparison (to ISO date string or null)
 */
function normalizeDate(date: string | null | undefined): string | null {
  if (!date) return null;
  try {
    return new Date(date).toISOString();
  } catch {
    return date;
  }
}

/**
 * Get display information for a field
 * Note: Icons are passed as a parameter to avoid importing lucide-react in utils package
 */
export function getFieldDisplayInfo(
  fieldName: ComparableField,
  t: (key: string, options?: { defaultValue?: string }) => string,
  icons: {
    FileText: IconComponent;
    Flag: IconComponent;
    Clock: IconComponent;
    Calendar: IconComponent;
    Target: IconComponent;
    Layers: IconComponent;
    CheckCircle2: IconComponent;
    Users: IconComponent;
    Tag: IconComponent;
    FolderKanban: IconComponent;
  }
): FieldDisplayInfo {
  const fieldConfig: Record<ComparableField, FieldDisplayInfo> = {
    name: {
      label: t('field.name', { defaultValue: 'Name' }),
      icon: icons.FileText,
      category: 'core',
    },
    description: {
      label: t('field.description', { defaultValue: 'Description' }),
      icon: icons.FileText,
      category: 'core',
    },
    priority: {
      label: t('field.priority', { defaultValue: 'Priority' }),
      icon: icons.Flag,
      category: 'core',
    },
    start_date: {
      label: t('field.start_date', { defaultValue: 'Start Date' }),
      icon: icons.Clock,
      category: 'dates',
    },
    end_date: {
      label: t('field.end_date', { defaultValue: 'Due Date' }),
      icon: icons.Calendar,
      category: 'dates',
    },
    estimation_points: {
      label: t('field.estimation', { defaultValue: 'Estimation' }),
      icon: icons.Target,
      category: 'core',
    },
    list_id: {
      label: t('field.list', { defaultValue: 'List' }),
      icon: icons.Layers,
      category: 'core',
    },
    completed: {
      label: t('field.completed', { defaultValue: 'Completed' }),
      icon: icons.CheckCircle2,
      category: 'core',
    },
    assignees: {
      label: t('field.assignees', { defaultValue: 'Assignees' }),
      icon: icons.Users,
      category: 'relationships',
    },
    labels: {
      label: t('field.labels', { defaultValue: 'Labels' }),
      icon: icons.Tag,
      category: 'relationships',
    },
    projects: {
      label: t('field.projects', { defaultValue: 'Projects' }),
      icon: icons.FolderKanban,
      category: 'relationships',
    },
  };

  return fieldConfig[fieldName];
}

/**
 * Get priority label for a priority value
 */
export function getPriorityLabel(
  priority: TaskPriorityType | null,
  t: (key: string, options?: { defaultValue?: string }) => string
): string {
  if (priority === null) return t('priority.none', { defaultValue: 'None' });

  const labels: Record<TaskPriorityType, string> = {
    low: t('priority.low', { defaultValue: 'Low' }),
    normal: t('priority.normal', { defaultValue: 'Normal' }),
    high: t('priority.high', { defaultValue: 'High' }),
    critical: t('priority.critical', { defaultValue: 'Critical' }),
  };

  return labels[priority] || String(priority);
}

/**
 * Format a date for display
 */
export function formatDateForDisplay(
  date: string | null | undefined,
  locale: string = 'en'
): string {
  if (!date) return '-';

  try {
    return new Date(date).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date;
  }
}

/**
 * Get a summary of relationship changes
 */
export function getRelationshipDiff<T extends { id: string; name?: string }>(
  snapshotItems: T[],
  currentItems: T[]
): {
  added: T[];
  removed: T[];
  unchanged: T[];
} {
  const snapshotIds = new Set(snapshotItems.map((i) => i.id));
  const currentIds = new Set(currentItems.map((i) => i.id));

  const added = currentItems.filter((i) => !snapshotIds.has(i.id));
  const removed = snapshotItems.filter((i) => !currentIds.has(i.id));
  const unchanged = snapshotItems.filter((i) => currentIds.has(i.id));

  return { added, removed, unchanged };
}
