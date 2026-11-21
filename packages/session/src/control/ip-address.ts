/**
 * A full IPv4 and IPv6 text parser. IPv6 accepts every RFC 4291 form,
 * including `::` in any position and an embedded IPv4 tail, and always
 * expands to eight 16-bit groups before any prefix is taken. An
 * IPv4-mapped address (`::ffff:a.b.c.d`) is that IPv4 address.
 */

export type IpAddress =
  | Readonly<{ family: 4; octets: readonly number[] }>
  | Readonly<{ family: 6; groups: readonly number[] }>;

const IPV4_OCTET = /^(0|[1-9][0-9]{0,2})$/;
const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/;
const MAX_ADDRESS_LENGTH = 45;

function parseIpv4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!IPV4_OCTET.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function parseIpv6(text: string): number[] | null {
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const split = (part: string) => (part === '' ? [] : part.split(':'));
  const head = split(halves[0] as string);
  const tail = halves.length === 2 ? split(halves[1] as string) : [];
  const groups: number[] = [];
  const readGroups = (parts: string[], allowTail: boolean) => {
    const out: number[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] as string;
      if (allowTail && index === parts.length - 1 && part.includes('.')) {
        const v4 = parseIpv4(part);
        if (!v4) return null;
        out.push(
          ((v4[0] as number) << 8) | (v4[1] as number),
          ((v4[2] as number) << 8) | (v4[3] as number)
        );
        continue;
      }
      if (!IPV6_GROUP.test(part)) return null;
      out.push(Number.parseInt(part, 16));
    }
    return out;
  };
  const headGroups = readGroups(head, halves.length === 1);
  const tailGroups = readGroups(tail, true);
  if (!headGroups || !tailGroups) return null;
  if (halves.length === 1) {
    if (headGroups.length !== 8) return null;
    return headGroups;
  }
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 1) return null;
  groups.push(...headGroups, ...Array<number>(missing).fill(0), ...tailGroups);
  return groups;
}

/**
 * Parses an address, or returns null. Zone ids, brackets, ports, a second
 * `::`, groups over `ffff`, leading-zero IPv4 octets and empty values are
 * rejected. A mapped IPv4 address returns family 4.
 */
export function parseIpAddress(
  value: string | null | undefined
): IpAddress | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || text.length > MAX_ADDRESS_LENGTH) return null;
  if (!text.includes(':')) {
    const octets = parseIpv4(text);
    return octets ? Object.freeze({ family: 4, octets }) : null;
  }
  const groups = parseIpv6(text);
  if (!groups) return null;
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const high = groups[6] as number;
    const low = groups[7] as number;
    return Object.freeze({
      family: 4,
      octets: [high >> 8, high & 0xff, low >> 8, low & 0xff],
    });
  }
  return Object.freeze({ family: 6, groups });
}

/** RFC 5952 text for eight groups: lowercase, longest zero run as `::`. */
export function formatIpv6(groups: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < 8; start += 1) {
    let length = 0;
    while (start + length < 8 && groups[start + length] === 0) length += 1;
    if (length > bestLength && length >= 2) {
      bestStart = start;
      bestLength = length;
    }
  }
  const text = groups.map((group) => group.toString(16));
  if (bestStart === -1) return text.join(':');
  return `${text.slice(0, bestStart).join(':')}::${text
    .slice(bestStart + bestLength)
    .join(':')}`;
}

/** The address's bits as a big-endian array of 8 or 16 bytes. */
function addressBytes(address: IpAddress): number[] {
  if (address.family === 4) return [...address.octets];
  return address.groups.flatMap((group) => [group >> 8, group & 0xff]);
}

/** A parsed CIDR range. */
export type CidrRange = Readonly<{ address: IpAddress; prefix: number }>;

/** Parses `address/prefix`, or returns null. Host bits may be set. */
export function parseCidr(value: string): CidrRange | null {
  if (typeof value !== 'string') return null;
  const slash = value.indexOf('/');
  if (slash === -1) return null;
  const text = value.slice(0, slash).trim();
  const prefixText = value.slice(slash + 1).trim();
  if (!/^(0|[1-9][0-9]{0,2})$/.test(prefixText)) return null;
  const prefix = Number(prefixText);
  // A range keeps the family it was written in, so its prefix length is
  // read against that family; a mapped IPv6 range matches no address,
  // because a mapped address is read as IPv4.
  const address = text.includes(':')
    ? (() => {
        const groups = parseIpv6(text);
        return groups ? ({ family: 6, groups } as const) : null;
      })()
    : parseIpAddress(text);
  if (!address) return null;
  if (prefix > (address.family === 4 ? 32 : 128)) return null;
  return Object.freeze({ address, prefix });
}

/** Whether `address` lies inside `range`; families never cross. */
export function cidrContains(range: CidrRange, address: IpAddress): boolean {
  if (range.address.family !== address.family) return false;
  const want = addressBytes(range.address);
  const have = addressBytes(address);
  let bits = range.prefix;
  for (let index = 0; bits > 0; index += 1) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if (((want[index] as number) & mask) !== ((have[index] as number) & mask)) {
      return false;
    }
    bits -= 8;
  }
  return true;
}

/** The IPv4 `/24` or the IPv6 `/64` of the expanded address. */
export function limitPrefix(address: IpAddress): string {
  if (address.family === 4) {
    const [a, b, c] = address.octets;
    return `${a}.${b}.${c}.0/24`;
  }
  return `${formatIpv6([...address.groups.slice(0, 4), 0, 0, 0, 0])}/64`;
}

/** The `ipp` display prefix: IPv4 `/24`, or IPv6 `/48` in RFC 5952 form. */
export function displayPrefix(address: IpAddress): string {
  if (address.family === 4) return limitPrefix(address);
  return `${formatIpv6([...address.groups.slice(0, 3), 0, 0, 0, 0, 0])}/48`;
}
