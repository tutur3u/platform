import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, type Dispatcher } from 'undici';

export type ManagedAssetResolver = (
  hostname: string
) => Promise<LookupAddress[]>;

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateNetworkAddress(address: string) {
  const normalized = address.toLowerCase().split('%')[0] ?? address;
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('2001:db8:') ||
    normalized.startsWith('::ffff:')
  );
}

export async function resolveSafeManagedAssetAddress(
  url: URL,
  resolveHost: ManagedAssetResolver = resolveManagedAssetHost
) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) asset sources are allowed');
  }
  if (url.username || url.password) {
    throw new Error('Asset source credentials are not allowed');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await resolveHost(hostname);
  if (
    addresses.length === 0 ||
    addresses.some((result) => isPrivateNetworkAddress(result.address))
  ) {
    throw new Error('Asset source resolves to a private or reserved address');
  }
  return addresses[0] as LookupAddress;
}

export function createManagedAssetPinnedDispatcher(record: LookupAddress) {
  return new Agent({
    connect: {
      lookup: ((
        _hostname: string,
        _options: unknown,
        callback: (
          error: NodeJS.ErrnoException | null,
          address: string,
          family: number
        ) => void
      ) => callback(null, record.address, record.family)) as never,
    },
  });
}

export async function closeManagedAssetDispatcher(dispatcher: Dispatcher) {
  await dispatcher.destroy().catch(() => null);
}

async function resolveManagedAssetHost(hostname: string) {
  const ipVersion = isIP(hostname);
  if (ipVersion) return [{ address: hostname, family: ipVersion }];
  return lookup(hostname, { all: true, verbatim: true });
}
