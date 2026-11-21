import 'server-only';

import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { Agent, type Dispatcher, fetch as undiciFetch } from 'undici';
import type { ManagedCronHttpMethod } from './validation';

export type ManagedCronFetch = (
  input: URL,
  init: {
    cache: 'no-store';
    dispatcher: Dispatcher;
    headers: Headers;
    method: ManagedCronHttpMethod;
    redirect: 'manual';
    signal: AbortSignal;
  }
) => Promise<Response>;

export type ManagedCronResolver = (
  hostname: string
) => Promise<LookupAddress[]>;

export type ManagedCronDispatcherFactory = (
  record: LookupAddress
) => Dispatcher;

export interface ManagedCronNetworkDependencies {
  createDispatcher?: ManagedCronDispatcherFactory;
  fetchImpl?: ManagedCronFetch;
  resolveHost?: ManagedCronResolver;
}

export interface ResolvedManagedCronNetworkDependencies {
  createDispatcher: ManagedCronDispatcherFactory;
  fetchImpl: ManagedCronFetch;
  resolveHost: ManagedCronResolver;
}

export const defaultManagedCronNetwork: ResolvedManagedCronNetworkDependencies =
  {
    createDispatcher: createManagedCronPinnedDispatcher,
    fetchImpl: undiciFetch as unknown as ManagedCronFetch,
    resolveHost: resolveManagedCronHost,
  };

export function resolveManagedCronNetwork(
  dependencies: ManagedCronNetworkDependencies = {}
): ResolvedManagedCronNetworkDependencies {
  return {
    createDispatcher:
      dependencies.createDispatcher ??
      defaultManagedCronNetwork.createDispatcher,
    fetchImpl: dependencies.fetchImpl ?? defaultManagedCronNetwork.fetchImpl,
    resolveHost:
      dependencies.resolveHost ?? defaultManagedCronNetwork.resolveHost,
  };
}

export async function resolveSafeManagedCronAddress(
  url: URL,
  resolveHost: ManagedCronResolver = resolveManagedCronHost
) {
  if (url.protocol !== 'https:') {
    throw new Error('Managed cron endpoint must use HTTPS.');
  }

  if (isBlockedManagedCronHostname(url.hostname)) {
    throw new Error('Managed cron endpoint must use a public hostname.');
  }

  const records = await resolveHost(url.hostname);
  if (records.length === 0) {
    throw new Error('Managed cron endpoint resolved to no usable address.');
  }

  if (records.some((record) => isPrivateManagedCronIp(record.address))) {
    throw new Error(
      'Managed cron endpoint resolved to a private network address.'
    );
  }

  return records[0] as LookupAddress;
}

export async function closeManagedCronDispatcher(dispatcher: Dispatcher) {
  await dispatcher.close().catch(() => null);
}

export function isPrivateManagedCronIp(value: string) {
  const ip = normalizeIpLiteral(value);
  const mappedIpv4 = getIpv4FromMappedIpv6(ip);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  const ipVersion = net.isIP(ip);
  if (ipVersion === 0) return false;

  if (ipVersion === 6) {
    const normalized = ip.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8')
    );
  }

  return isPrivateIpv4(ip);
}

async function resolveManagedCronHost(hostname: string) {
  const ipLiteral = normalizeIpLiteral(hostname);
  const ipVersion = net.isIP(ipLiteral);

  if (ipVersion) {
    return [
      {
        address: ipLiteral,
        family: ipVersion,
      },
    ];
  }

  return lookup(hostname, { all: true, verbatim: true });
}

function createManagedCronPinnedDispatcher(record: LookupAddress) {
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
      ) => {
        callback(null, record.address, record.family);
      }) as never,
    },
  });
}

function isBlockedManagedCronHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    isPrivateManagedCronIp(normalized)
  );
}

function normalizeIpLiteral(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function getIpv4FromMappedIpv6(value: string) {
  const normalized = normalizeIpLiteral(value);
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (dotted && net.isIP(dotted) === 4) return dotted;

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (!hex) return null;

  const high = Number.parseInt(hex[1] as string, 16);
  const low = Number.parseInt(hex[2] as string, 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join('.');
}

function isPrivateIpv4(value: string) {
  const parts = value.split('.').map((part) => Number(part));
  const [a, b] = parts;
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    a === undefined ||
    b === undefined
  ) {
    return true;
  }

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
