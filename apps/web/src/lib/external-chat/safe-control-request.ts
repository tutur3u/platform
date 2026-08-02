import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);
const MAX_CONTROL_RESPONSE_BYTES = 1024 * 1024;

export class ExternalChatUrlPolicyError extends Error {}

function mappedIpv4Address(address: string) {
  const prefix = address.startsWith('64:ff9b::')
    ? '64:ff9b::'
    : address.startsWith('::ffff:')
      ? '::ffff:'
      : address.startsWith('::')
        ? '::'
        : null;
  if (!prefix) return null;
  const suffix = address.slice(prefix.length);
  if (prefix === '64:ff9b::' && suffix === '') return '0.0.0.0';
  if (isIP(suffix) === 4) return suffix;

  const groups = suffix.split(':');
  if (groups.length !== 2) return null;
  const high = Number.parseInt(groups[0] ?? '', 16);
  const low = Number.parseInt(groups[1] ?? '', 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

export function isBlockedExternalChatAddress(address: string) {
  const normalized =
    address
      .toLowerCase()
      .replace(/^\[|\]$/gu, '')
      .split('%')[0] ?? address;
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('64:ff9b:1:')) return true;
  if (/^fe[89ab]/u.test(normalized)) return true;
  if (/^fe[c-f]/u.test(normalized)) return true;
  if (
    normalized.startsWith('100:') ||
    normalized.startsWith('2001:db8:') ||
    normalized.startsWith('2001:2:') ||
    normalized.startsWith('2001:10:') ||
    normalized.startsWith('2002:')
  ) {
    return true;
  }
  const mappedIpv4 = mappedIpv4Address(normalized);
  if (mappedIpv4) return isBlockedExternalChatAddress(mappedIpv4);
  if (isIP(normalized) !== 4) return false;
  const [a = 0, b = 0] = normalized.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 168) ||
    (a === 192 &&
      b === 0 &&
      normalized !== '192.0.0.9' &&
      normalized !== '192.0.0.10') ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && normalized.startsWith('203.0.113.')) ||
    a >= 224
  );
}

export async function assertSafeExternalChatUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port === '0' ||
    BLOCKED_HOSTNAMES.has(hostname.toLowerCase()) ||
    isIP(hostname)
  ) {
    throw new ExternalChatUrlPolicyError(
      'External chat URL must be a public HTTPS hostname'
    );
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedExternalChatAddress(address))
  ) {
    throw new ExternalChatUrlPolicyError(
      'External chat URL does not resolve to a public address'
    );
  }
  return url;
}

export async function safeExternalChatFetch(
  urlValue: string,
  init: Parameters<typeof undiciFetch>[1]
) {
  const url = await assertSafeExternalChatUrl(urlValue);
  const dispatcher = new Agent({
    connect: {
      lookup: async (hostname, options, callback) => {
        try {
          const addresses = await lookup(hostname, {
            all: true,
            verbatim: true,
          });
          if (
            addresses.length === 0 ||
            addresses.some(({ address }) =>
              isBlockedExternalChatAddress(address)
            )
          ) {
            callback(new Error('Unsafe external chat destination'), '', 0);
            return;
          }
          if (options.all) {
            callback(null, addresses);
            return;
          }
          const selected = addresses[0]!;
          callback(null, selected.address, selected.family);
        } catch (error) {
          callback(error as Error, '', 0);
        }
      },
    },
  });

  try {
    const response = await undiciFetch(url, {
      ...init,
      dispatcher,
      redirect: 'error',
    });
    const contentLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_CONTROL_RESPONSE_BYTES
    ) {
      await response.body?.cancel();
      throw new Error('External chat control response is too large');
    }

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_CONTROL_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error('External chat control response is too large');
        }
        chunks.push(value);
      }
    }

    return new Response(Buffer.concat(chunks), {
      headers: Array.from(response.headers.entries()),
      status: response.status,
      statusText: response.statusText,
    });
  } finally {
    await dispatcher.destroy();
  }
}
