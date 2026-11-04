import { isValidIpAddress } from '../abuse-protection/ip-address';

/** Canonical IPv4 or IPv6 /64; invalid/missing addresses share one bucket. */
export function guardSourceBucket(value?: string | null) {
  const ip = value?.trim() ?? '';
  if (!isValidIpAddress(ip) || ip.includes('%')) return 'unknown';
  if (!ip.includes(':')) return ip;
  // URL canonicalization handles compression and IPv4-mapped addresses.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left = '', right = ''] = canonical.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const groups = canonical.includes('::')
    ? [
        ...head,
        ...Array<string>(8 - head.length - tail.length).fill('0'),
        ...tail,
      ]
    : head;
  if (
    groups.slice(0, 5).every((group) => Number.parseInt(group, 16) === 0) &&
    Number.parseInt(groups[5] ?? '', 16) === 0xffff
  ) {
    const high = Number.parseInt(groups[6] ?? '0', 16);
    const low = Number.parseInt(groups[7] ?? '0', 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`;
}
