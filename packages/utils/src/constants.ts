export const GITHUB_OWNER = 'tutur3u';
export const GITHUB_REPO = 'platform';
export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
export const INTERNAL_WORKSPACE_SLUG = 'internal';
export const PERSONAL_WORKSPACE_SLUG = 'personal';

// Workspace creation limits
export const MAX_WORKSPACES_FOR_FREE_USERS = 10;

export const resolveWorkspaceId = (identifier: string): string => {
  if (!identifier) return identifier;

  if (identifier.toLowerCase() === INTERNAL_WORKSPACE_SLUG) {
    return ROOT_WORKSPACE_ID;
  }

  return identifier;
};

export const toWorkspaceSlug = (
  workspaceId: string,
  { personal = false }: { personal?: boolean } = {}
): string => {
  if (personal) return PERSONAL_WORKSPACE_SLUG;
  if (workspaceId === ROOT_WORKSPACE_ID) return INTERNAL_WORKSPACE_SLUG;
  return workspaceId;
};

export const isInternalWorkspaceSlug = (
  identifier?: string | null
): boolean => {
  if (!identifier) return false;
  return identifier.toLowerCase() === INTERNAL_WORKSPACE_SLUG;
};

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';
