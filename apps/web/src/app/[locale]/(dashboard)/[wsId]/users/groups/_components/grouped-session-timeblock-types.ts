import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';

export type GroupedTimeblockMoveTarget = 'all' | 'selected';
export type GroupedTimeblockMoveScope = 'future' | 'once';

export interface GroupedTimeblockMoveRequest {
  date: string;
  scope: GroupedTimeblockMoveScope;
  sessions: WorkspaceUserGroupSession[];
  time: string;
  timezone: string;
}

export interface GroupedTimeblockMoveResult {
  failedCount: number;
  movedCount: number;
}
