import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  resolveClientIp,
  UNKNOWN_CLIENT_IP,
} from '@tuturuuu/utils/abuse-protection/client-ip';
import { hasRequiredProxyIpBlock } from '@tuturuuu/utils/abuse-protection/edge';
import { networkSubject } from '@tuturuuu/utils/network-subject';

export function meetEventClientIp(headers: Headers) {
  const ip = resolveClientIp(headers);
  return ip === UNKNOWN_CLIENT_IP ? undefined : ip;
}

export async function meetEventNetworkAllowed(ip: string | undefined) {
  if (!ip) return false;
  try {
    const admin = await createAdminClient({ noCookie: true });
    const subjects = [...new Set([ip, networkSubject(ip)])];
    const blocked = await Promise.all(
      subjects.map(async (subject) => {
        const [proxy, persisted] = await Promise.all([
          hasRequiredProxyIpBlock(subject),
          admin.rpc('get_active_ip_block', { p_ip_address: subject }),
        ]);
        if (persisted.error || !Array.isArray(persisted.data)) return true;
        return proxy || persisted.data.length > 0;
      })
    );
    return blocked.every((value) => !value);
  } catch {
    return false;
  }
}
