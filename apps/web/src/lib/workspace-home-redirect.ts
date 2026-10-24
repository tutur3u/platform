import { copySettingsDialogParams } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

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
