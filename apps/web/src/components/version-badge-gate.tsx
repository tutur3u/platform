import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getWebPlatformReleaseInfo } from '@/lib/platform-release-runtime';

export async function VersionBadgeGate({
  appName,
  userEmail,
}: {
  appName: string;
  userEmail: string | null | undefined;
}) {
  if (!isExactTuturuuuDotComEmail(userEmail)) {
    return null;
  }

  const { VersionBadge } = await import('@tuturuuu/ui/custom/version-badge');

  return <VersionBadge release={getWebPlatformReleaseInfo(appName)} />;
}
