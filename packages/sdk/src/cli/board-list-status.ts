import type { FlagValue } from './args';

export function getBoardListStatus(
  flags: Record<string, FlagValue>
): 'active' | 'archived' | 'deleted' | 'all' {
  if (flags.all === true || flags['include-archived'] === true) return 'all';
  if (flags.archived === true) return 'archived';
  if (flags.deleted === true || flags['recently-deleted'] === true) {
    return 'deleted';
  }
  return 'active';
}
