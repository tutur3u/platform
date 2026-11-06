const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

function isValidIpv6(value: string): boolean {
  if (value.length > 45) return false;

  let groups = value;
  let maxGroups = 8;
  const lastColon = groups.lastIndexOf(':');
  const tail = groups.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!IPV4_PATTERN.test(tail)) return false;
    groups = `${groups.slice(0, lastColon + 1)}0`;
    maxGroups = 7;
  }

  const halves = groups.split('::');
  if (halves.length > 2) return false;

  const parseHalf = (half: string) => (half === '' ? [] : half.split(':'));
  const head = parseHalf(halves[0] ?? '');
  const rest = halves.length === 2 ? parseHalf(halves[1] ?? '') : [];
  const all = [...head, ...rest];
  if (!all.every((group) => IPV6_GROUP_PATTERN.test(group))) return false;

  // The IPv4 tail occupies two 16-bit groups but was replaced by one.
  const groupCount = all.length + (maxGroups === 7 ? 1 : 0);
  return halves.length === 2 ? groupCount < 8 : groupCount === 8;
}

/** Validate an IPv4 or IPv6 address literal. */
export function isValidIpAddress(value: string): boolean {
  if (!value) return false;
  if (IPV4_PATTERN.test(value)) return true;
  return value.includes(':') && isValidIpv6(value);
}

/**
 * Normalise a single header entry: trim, strip IPv6 brackets/zone ids and an
 * IPv4 `:port` suffix, lowercase IPv6. Returns null when it is not an IP.
 */
export function normalizeClientIp(raw: string | null | undefined) {
  let value = raw?.trim();
  if (!value) return null;

  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1]) {
    value = bracketed[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }

  const zoneIndex = value.indexOf('%');
  if (zoneIndex > 0 && value.includes(':')) {
    value = value.slice(0, zoneIndex);
  }

  if (!isValidIpAddress(value)) return null;
  return value.includes(':') ? value.toLowerCase() : value;
}
