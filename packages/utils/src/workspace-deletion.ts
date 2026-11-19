import { ROOT_WORKSPACE_ID } from './constants';

type DeletableWorkspace = {
  id: string;
  creator_id: string | null;
  personal: boolean | null;
};

export function isWorkspaceDeletionOwner(
  workspace: DeletableWorkspace,
  actorId: string | null | undefined
): boolean {
  return (
    Boolean(actorId) &&
    workspace.creator_id === actorId &&
    workspace.id !== ROOT_WORKSPACE_ID &&
    workspace.personal === false
  );
}

export function isWorkspaceDeletionConfirmed(
  confirmation: unknown,
  workspace: { name: string | null }
): boolean {
  if (typeof confirmation !== 'string') return false;
  const typed = confirmation.trim();
  return typed.length > 0 && typed === workspace.name?.trim();
}
