import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { getNovaAppSessionUserFromHeaders } from '@/lib/app-session';

export async function VersionBadgeGate() {
  const user = await getNovaAppSessionUserFromHeaders();

  if (!isExactTuturuuuDotComEmail(user?.email)) {
    return null;
  }

  return <VersionBadge release={getPlatformReleaseInfo('Nova')} />;
}
