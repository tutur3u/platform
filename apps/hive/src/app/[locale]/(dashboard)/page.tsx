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
  const metadata =
    user.user_metadata && typeof user.user_metadata === 'object'
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  const displayName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null;
  const avatarUrl =
    typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null;
  const handle =
    typeof metadata.user_name === 'string'
      ? metadata.user_name
      : typeof metadata.preferred_username === 'string'
        ? metadata.preferred_username
        : null;

  return (
    <HiveStudio
      currentUser={{
        avatarUrl,
        displayName,
        email: user.email ?? '',
        handle,
        id: user.id,
      }}
      initialServers={serversResponse}
      isAdmin={isAdmin}
      realtimeUrl={HIVE_REALTIME_URL}
    />
  );
}
