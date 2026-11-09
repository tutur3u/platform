import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { getInternalAppDomainByUrl } from '@tuturuuu/utils/internal-domains';

function hasWorkspacePathSegment(pathname: string, workspaceId: string) {
  return pathname.split('/').some((segment) => {
    try {
      return decodeURIComponent(segment) === workspaceId;
    } catch {
      return false;
    }
  });
}

export function resolveWorkspaceSetupReturnUrl(
  rawReturnUrl: string | null | undefined,
  workspaceId: string
) {
  if (!rawReturnUrl || rawReturnUrl.length > MAX_URL_LENGTH) return null;

  const appDomain = getInternalAppDomainByUrl(rawReturnUrl);
  if (!appDomain || appDomain.name === 'platform') return null;

  const returnUrl = new URL(appDomain.canonicalUrl);
  if (returnUrl.username || returnUrl.password) return null;

  return hasWorkspacePathSegment(returnUrl.pathname, workspaceId)
    ? returnUrl
    : null;
}
