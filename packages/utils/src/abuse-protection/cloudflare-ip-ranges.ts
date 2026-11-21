/**
 * Cloudflare's published edge and egress ranges
 * (https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6).
 * A request resolved to one of these addresses carries no visitor address of
 * its own (Worker egress, the apex gateway without a verified proof), so
 * one block or one shared bucket on it would hit every visitor behind it.
 * `cloudflare-ip-ranges.test.ts` pins the lists; update both together.
 */
export const CLOUDFLARE_IPV4_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
] as const;

export const CLOUDFLARE_IPV6_RANGES = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const;

function parseIpv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result;
}

function parseIpv6(value: string): bigint | null {
  let text = value.toLowerCase();
  // An embedded IPv4 tail occupies the last two groups.
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const ipv4 = parseIpv4(tail);
    if (ipv4 === null) return null;
    text = `${text.slice(0, lastColon + 1)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...rest];
  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/u.test(group)) return null;
    result = (result << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return result;
}

const IPV4_NETWORKS = CLOUDFLARE_IPV4_RANGES.map((range) => {
  const [base, bits] = range.split('/');
  const size = 2 ** (32 - Number(bits));
  const start = parseIpv4(base ?? '') ?? 0;
  return { start, end: start + size - 1 };
});

const IPV6_NETWORKS = CLOUDFLARE_IPV6_RANGES.map((range) => {
  const [base, bits] = range.split('/');
  const shift = BigInt(128 - Number(bits));
  return { prefix: (parseIpv6(base ?? '') ?? 0n) >> shift, shift };
});

const IPV4_MAPPED_PREFIX = 0xffffn << 32n;

/** True when `ip` (a normalized client address) is a Cloudflare address. */
export function isCloudflareIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  if (!ip.includes(':')) {
    const value = parseIpv4(ip);
    return (
      value !== null &&
      IPV4_NETWORKS.some(({ start, end }) => value >= start && value <= end)
    );
  }
  const value = parseIpv6(ip);
  if (value === null) return false;
  if (value >> 32n === IPV4_MAPPED_PREFIX >> 32n) {
    return isCloudflareIp(
      [24n, 16n, 8n, 0n].map((shift) => (value >> shift) & 0xffn).join('.')
    );
  }
  return IPV6_NETWORKS.some(({ prefix, shift }) => value >> shift === prefix);
}
