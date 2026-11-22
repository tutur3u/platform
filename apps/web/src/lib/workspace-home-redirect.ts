import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { copySettingsDialogParams } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { hasSupabaseSessionCookie } from '@tuturuuu/utils/api-proxy-guard';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import type { NextRequest } from 'next/server';

/**
 * Where an authenticated root, locale-root or dashboard-alias request goes:
 * the default workspace's home (`/personal`, `/internal` or `/<id>`). Other
 * root query params are intentionally dropped, but settings deep links such
 * as `/?settingsTab=security` must survive the redirect.
 */
export function workspaceHomeRedirectUrl(
  workspace: { id: string; personal?: boolean | null },
  currentUrl: URL,
  localize: (path: string) => string
) {
  const target = workspace.personal
    ? 'personal'
    : workspace.id === ROOT_WORKSPACE_ID
      ? 'internal'
      : workspace.id;
  const redirectUrl = new URL(localize(`/${target}`), currentUrl);
  copySettingsDialogParams(currentUrl.searchParams, redirectUrl.searchParams);
  return redirectUrl;
}

export async function defaultWorkspaceHomeRedirectUrl(
  req: NextRequest,
  localize: (path: string) => string
): Promise<URL | null> {
  if (!hasSupabaseSessionCookie(req)) return null;

  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user) return null;

    const workspace = await getUserDefaultWorkspace();
    return workspace
      ? workspaceHomeRedirectUrl(workspace, req.nextUrl, localize)
      : null;
  } catch (error) {
    console.error('Error handling root path redirect:', error);
    return null;
  }
}
