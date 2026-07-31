import { getAiStudioWorkspaceContext } from './access';

export interface AiStudioPageContext {
  canManageAiKeys: boolean;
  canManageAiPolicy: boolean;
  canUseAiStudio: boolean;
  workspaceId: string;
}

/**
 * Resolves the permissions and the canonical workspace id every section page
 * needs. `wsId` may be an alias such as `personal`, so pages must render links
 * with the returned `workspaceId`.
 */
export async function getAiStudioPageContext(
  wsId: string
): Promise<AiStudioPageContext> {
  const context = await getAiStudioWorkspaceContext(wsId);

  return {
    canManageAiKeys:
      context?.permissions.containsPermission('manage_ai_keys') ?? false,
    canManageAiPolicy:
      context?.permissions.containsPermission('manage_ai_policy') ?? false,
    canUseAiStudio:
      context?.permissions.containsPermission('use_ai_studio') ?? false,
    workspaceId: context?.workspace.id ?? wsId,
  };
}
