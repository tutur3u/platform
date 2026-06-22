import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWebPlatformReleaseInfo } from '@/lib/platform-release-runtime';

export async function VersionBadgeGate({ appName }: { appName: string }) {
  const user = await getCurrentUser();

  if (!isExactTuturuuuDotComEmail(user?.email)) {
    return null;
  }

  const { VersionBadge } = await import('@tuturuuu/ui/custom/version-badge');

  return <VersionBadge release={getWebPlatformReleaseInfo(appName)} />;
}
