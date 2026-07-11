import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { connection } from 'next/server';
import { getSatelliteCurrentUser } from '../auth';

export async function SatelliteVersionBadge({ appName }: { appName: string }) {
  await connection();

  const user = await getSatelliteCurrentUser();

  if (!isExactTuturuuuDotComEmail(user?.email)) {
    return null;
  }

  return <VersionBadge release={getPlatformReleaseInfo(appName)} />;
}
