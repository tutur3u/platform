import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRatelimitRedisClient } from '@tuturuuu/utils/upstash-rest';
import { z } from 'zod';

const METADATA_KEY = 'tuturuuu_device_authenticators';
const deviceSchema = z.object({
  factorId: z.string(),
  name: z.string(),
  proofHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string(),
  verified: z.boolean(),
});
export const registrySchema = z.object({
  version: z.literal(1),
  locked: z.boolean(),
  devices: z.array(deviceSchema).max(10),
});
export type DeviceRegistry = z.infer<typeof registrySchema>;
export class DeviceMfaError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function readRegistry(value: unknown): DeviceRegistry {
  if (value === undefined || value === null)
    return { version: 1, locked: false, devices: [] };
  const parsed = registrySchema.safeParse(value);
  if (!parsed.success)
    throw new DeviceMfaError(503, 'Authenticator settings are unavailable');
  return parsed.data;
}
export function deviceProofHash(proof: string) {
  return createHash('sha256').update(proof).digest('hex');
}
export function hasDeviceProof(
  registry: DeviceRegistry,
  factorId: string,
  proof: string,
  allowPending = false
) {
  const device = registry.devices.find(
    (item) => item.factorId === factorId && (allowPending || item.verified)
  );
  if (!device || proof.length < 32 || proof.length > 256) return false;
  return timingSafeEqual(
    Buffer.from(device.proofHash, 'hex'),
    Buffer.from(deviceProofHash(proof), 'hex')
  );
}
export async function loadDeviceRegistry(userId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user)
    throw new DeviceMfaError(503, 'Authenticator settings are unavailable');
  return readRegistry(data.user.app_metadata[METADATA_KEY]);
}

/** Server-owned app_metadata is authoritative; a distributed lease serializes
 * registry mutations. Missing lock infrastructure fails closed. No client can
 * grant trust by editing user_metadata or by supplying a device identifier. */
export async function mutateDeviceRegistry<T>(
  userId: string,
  action: (registry: DeviceRegistry) => Promise<T>
): Promise<T> {
  const redis = await getUpstashRatelimitRedisClient();
  if (!redis)
    throw new DeviceMfaError(
      503,
      'Authenticator registration is temporarily unavailable'
    );
  const key = `auth:device-mfa:lock:${userId}`;
  const lease = randomBytes(24).toString('hex');
  if (!(await redis.set(key, lease, { nx: true, ex: 300 }))) {
    throw new DeviceMfaError(
      409,
      'Another authenticator change is in progress. Try again.'
    );
  }
  const startedAt = Date.now();
  try {
    const registry = await loadDeviceRegistry(userId);
    const result = await action(registry);
    if (Date.now() - startedAt > 60_000 || (await redis.get(key)) !== lease) {
      throw new DeviceMfaError(503, 'Authenticator registration timed out');
    }
    const admin = await createAdminClient({ noCookie: true });
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { [METADATA_KEY]: registrySchema.parse(registry) },
    });
    if (error)
      throw new DeviceMfaError(503, 'Could not save authenticator settings');
    return result;
  } finally {
    await redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        [key],
        [lease]
      )
      .catch(() => {
        // The bounded lease expires automatically; do not mask a saved mutation.
        console.warn('Could not release authenticator registry lease');
      });
  }
}

export function publicRegistry(registry: DeviceRegistry) {
  return {
    locked: registry.locked,
    devices: registry.devices.map(({ proofHash: _, ...device }) => device),
  };
}

/** Resolve trust against current server data, never a stale JWT claim. */
export async function isTrustedAuthenticator(
  userId: string,
  input: {
    factorId?: string;
    proof?: string;
  }
) {
  if (!input.factorId || !input.proof) return false;
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  const registry = readRegistry(data.user.app_metadata[METADATA_KEY]);
  return (
    hasDeviceProof(registry, input.factorId, input.proof) &&
    Boolean(
      data.user.factors?.some(
        (factor) =>
          factor.id === input.factorId &&
          factor.factor_type === 'totp' &&
          factor.status === 'verified'
      )
    )
  );
}
