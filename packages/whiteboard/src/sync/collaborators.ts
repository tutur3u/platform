import type { Collaborator, SocketId } from '@excalidraw/excalidraw/types';
import type { SelectedElementIds } from '../types';

export interface WhiteboardCursor {
  x: number;
  y: number;
  tool?: string;
}

export interface WhiteboardPresenceMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

// Distinct, accessible collaboration colors.
const COLLABORATOR_COLORS = [
  '#E57373',
  '#64B5F6',
  '#81C784',
  '#FFB74D',
  '#BA68C8',
  '#4DD0E1',
  '#F06292',
  '#AED581',
  '#FFD54F',
  '#7986CB',
] as const;

/** Deterministic color for a user id, stable across sessions and peers. */
export function getCollaboratorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length]!;
}

function toCollaborator(
  userId: string,
  username: string,
  avatarUrl: string | undefined,
  cursor: WhiteboardCursor | undefined,
  selectedElementIds: SelectedElementIds | undefined
): Collaborator {
  const color = getCollaboratorColor(userId);

  return {
    id: userId,
    socketId: userId as SocketId,
    username,
    ...(avatarUrl ? { avatarUrl } : {}),
    color: { background: color, stroke: color },
    pointer: cursor
      ? {
          x: cursor.x,
          y: cursor.y,
          tool: cursor.tool as 'pointer' | 'laser',
        }
      : undefined,
    selectedElementIds,
  };
}

/**
 * Builds the Excalidraw collaborator map. With a presence roster, the roster
 * decides who is listed; without one, anyone with a live cursor or selection is.
 */
export function buildCollaborators({
  presence,
  cursors,
  selections,
}: {
  presence?: readonly WhiteboardPresenceMember[];
  cursors: ReadonlyMap<string, WhiteboardCursor>;
  selections: ReadonlyMap<string, SelectedElementIds>;
}): Map<SocketId, Collaborator> {
  const collaborators = new Map<SocketId, Collaborator>();

  if (presence) {
    for (const member of presence) {
      collaborators.set(
        member.id as SocketId,
        toCollaborator(
          member.id,
          member.displayName,
          member.avatarUrl,
          cursors.get(member.id),
          selections.get(member.id)
        )
      );
    }
    return collaborators;
  }

  const userIds = new Set<string>([...cursors.keys(), ...selections.keys()]);
  for (const userId of userIds) {
    collaborators.set(
      userId as SocketId,
      toCollaborator(
        userId,
        'Collaborator',
        undefined,
        cursors.get(userId),
        selections.get(userId)
      )
    );
  }

  return collaborators;
}

/** Returns `map` itself when no entry is stale, so state setters can bail out. */
export function pruneStaleEntries<T>(
  map: ReadonlyMap<string, T>,
  now: number,
  timeoutMs: number,
  getTimestamp: (entry: T) => number
): ReadonlyMap<string, T> {
  let pruned: Map<string, T> | null = null;

  for (const [key, entry] of map) {
    if (now - getTimestamp(entry) > timeoutMs) {
      pruned ??= new Map(map);
      pruned.delete(key);
    }
  }

  return pruned ?? map;
}
