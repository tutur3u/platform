import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';

const MAX_REMEMBERED = 2_000;
const remembered = new Map<string, boolean>();

/**
 * Whether `workspaceId` is the actor's personal workspace, remembered per
 * isolate. A workspace's personal flag never changes and only its owner can
 * read a personal workspace, so the answer for one actor and workspace is
 * stable; it is keyed by both. Without an actor id it always reads.
 */
export async function isActorPersonalWorkspace(
  actorId: string | null | undefined,
  workspaceId: string
) {
  if (!actorId) return isPersonalWorkspace(workspaceId);
  const key = `${actorId}:${workspaceId.toLowerCase()}`;
  const known = remembered.get(key);
  if (known !== undefined) return known;
  const personal = await isPersonalWorkspace(workspaceId);
  if (remembered.size >= MAX_REMEMBERED) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }
  remembered.set(key, personal);
  return personal;
}

/** Test seam: forget every remembered answer. */
export function resetPersonalWorkspaceChecks() {
  remembered.clear();
}
