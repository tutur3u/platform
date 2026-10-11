import type {
  LettinRecord,
  LettinWorkProgress,
} from '@tuturuuu/internal-api/lettin';

export const workProgressOptions = [
  'unstarted',
  'drafting',
  'revising',
  'ready',
] as const satisfies readonly LettinWorkProgress[];

export function filterWorkProgress(
  entries: LettinRecord[],
  progress: LettinWorkProgress | 'all'
) {
  return progress === 'all'
    ? entries
    : entries.filter(
        (entry) => (entry.draft.workProgress ?? 'unstarted') === progress
      );
}
