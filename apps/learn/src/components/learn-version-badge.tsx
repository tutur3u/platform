import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { connection } from 'next/server';
import { getLearnRenderProfile } from '@/lib/render-profile';

export async function LearnVersionBadge() {
  await connection();
  const user = await getLearnRenderProfile();

  return isExactTuturuuuDotComEmail(user?.email) ? (
    <VersionBadge release={getPlatformReleaseInfo('Learn')} />
  ) : null;
}
