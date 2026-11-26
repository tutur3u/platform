import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';

const MAX_REMEMBERED = 2_000;
/**
 * `isPersonalWorkspace` also answers false for a failed or RLS-hidden read,
 * so a false answer is only reused briefly; a true answer is a confirmed row.
 */
export const NOT_PERSONAL_TTL_MS = 5 * 60_000;
const remembered = new Map<string, { personal: boolean; until: number }>();

/**
 * Whether `workspaceId` is the actor's personal workspace, remembered per
 * isolate. A workspace's personal flag never changes and only its owner can
 * read a personal workspace, so the answer is keyed by actor and workspace.
 * Without an actor id it always reads.
 */
export async function isActorPersonalWorkspace(
  actorId: string | null | undefined,
  workspaceId: string
) {
  if (!actorId) return isPersonalWorkspace(workspaceId);
  const key = `${actorId}:${workspaceId.toLowerCase()}`;
  const known = remembered.get(key);
  if (known && known.until > Date.now()) return known.personal;
  remembered.delete(key);
  const personal = await isPersonalWorkspace(workspaceId);
  if (remembered.size >= MAX_REMEMBERED) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }
  remembered.set(key, {
    personal,
    until: personal
      ? Number.POSITIVE_INFINITY
      : Date.now() + NOT_PERSONAL_TTL_MS,
  });
  return personal;
}

/** Test seam: forget every remembered answer. */
export function resetPersonalWorkspaceChecks() {
  remembered.clear();
}
