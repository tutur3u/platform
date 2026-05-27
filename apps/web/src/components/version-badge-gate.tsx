import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export async function VersionBadgeGate({ appName }: { appName: string }) {
  const user = await getCurrentUser();

  if (!isExactTuturuuuDotComEmail(user?.email)) {
    return null;
  }

  return <VersionBadge release={getPlatformReleaseInfo(appName)} />;
}
