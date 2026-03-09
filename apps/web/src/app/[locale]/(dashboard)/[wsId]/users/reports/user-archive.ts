import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

type ArchiveUser = Pick<
  WorkspaceUser,
  'archived' | 'archived_until' | 'display_name' | 'full_name' | 'id' | 'name'
>;

export type WorkspaceUserArchiveState =
  | 'active'
  | 'temporary-archived'
  | 'archived';

export function getWorkspaceUserArchiveState(
  user: ArchiveUser,
  now = new Date()
): WorkspaceUserArchiveState {
  if (user.archived_until) {
    const archivedUntil = new Date(user.archived_until);
    if (!Number.isNaN(archivedUntil.getTime()) && archivedUntil > now) {
      return 'temporary-archived';
    }
  }

  if (user.archived) {
    return 'archived';
  }

  return 'active';
}

export function isWorkspaceUserArchived(
  user: ArchiveUser,
  now = new Date()
): boolean {
  return getWorkspaceUserArchiveState(user, now) !== 'active';
}

export function sortWorkspaceUsersByArchive<T extends ArchiveUser>(
  users: T[],
  now = new Date()
): T[] {
  return [...users].sort((left, right) => {
    const leftState = getWorkspaceUserArchiveState(left, now);
    const rightState = getWorkspaceUserArchiveState(right, now);

    const stateRank = {
      active: 0,
      'temporary-archived': 1,
      archived: 2,
    } as const;

    const stateDelta = stateRank[leftState] - stateRank[rightState];
    if (stateDelta !== 0) return stateDelta;

    const leftName = (
      left.full_name ||
      left.display_name ||
      left.name ||
      ''
    ).trim();
    const rightName = (
      right.full_name ||
      right.display_name ||
      right.name ||
      ''
    ).trim();

    if (!leftName && !rightName) return left.id.localeCompare(right.id);
    if (!leftName) return 1;
    if (!rightName) return -1;

    return leftName.localeCompare(rightName, undefined, {
      sensitivity: 'base',
    });
  });
}
