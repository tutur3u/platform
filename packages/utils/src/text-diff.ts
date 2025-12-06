import * as Diff from 'diff';

export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

/**
 * Computes a line-level diff between two text strings.
 * Returns an array of changes with their type (added/removed/unchanged).
 */
export function computeLineDiff(
  oldText: string,
  newText: string
): DiffChange[] {
  const changes = Diff.diffLines(oldText, newText);
  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    value: change.value,
  }));
}

/**
 * Computes a word-level diff between two text strings.
 * Useful for smaller changes within lines.
 */
export function computeWordDiff(
  oldText: string,
  newText: string
): DiffChange[] {
  const changes = Diff.diffWords(oldText, newText);
  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    value: change.value,
  }));
}

/**
 * Computes statistics from a diff result.
 * Counts the number of lines added, removed, and unchanged.
 */
export function getDiffStats(diff: DiffChange[]): DiffStats {
  return diff.reduce(
    (acc, d) => {
      const lines = d.value.split('\n').filter(Boolean).length;
      acc[d.type] += lines;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}

/**
 * Checks if a diff has any meaningful changes.
 */
export function hasDiffChanges(diff: DiffChange[]): boolean {
  return diff.some((d) => d.type !== 'unchanged');
}

/**
 * Formats a diff for display, adding line prefixes.
 */
export function formatDiffForDisplay(diff: DiffChange[]): string {
  return diff
    .map((d) => {
      const prefix =
        d.type === 'added' ? '+ ' : d.type === 'removed' ? '- ' : '  ';
      return d.value
        .split('\n')
        .filter(Boolean)
        .map((line) => prefix + line)
        .join('\n');
    })
    .join('\n');
}
