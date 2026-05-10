import {
  listHiveServers,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { HiveStudio } from '@/components/hive/hive-studio';
import { HIVE_REALTIME_URL } from '@/constants/common';
import { requireHiveAccess } from '@/lib/access';

export default async function HivePage() {
  const [{ isAdmin, user }, requestHeaders] = await Promise.all([
    requireHiveAccess(),
    headers(),
  ]);

  const serversResponse = await listHiveServers(
    withForwardedInternalApiAuth(requestHeaders)
  );

  return (
    <HiveStudio
      currentUser={{
        email: user.email ?? '',
        id: user.id,
      }}
      initialServers={serversResponse}
      isAdmin={isAdmin}
      realtimeUrl={HIVE_REALTIME_URL}
    />
  );
}
