export const INVITATION_ACTION_SCOPE = 'workspace-invitation:decide';
export const INVITATION_ACTION_TOKEN_TTL_SECONDS = 15 * 60;

export function invitationWorkspaceScope(workspaceId: string) {
  return `workspace:${workspaceId}`;
}
