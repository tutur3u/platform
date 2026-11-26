/**
 * The network a client address counts against for per-address limits. An
 * IPv4 address is its own network. An IPv6 client can rotate through the
 * addresses of its /64 at will, and a school's devices share one /64, so an
 * IPv6 address counts as its /64 (`2001:db8:0:0::/64`), with `::` expanded.
 * An IPv4-mapped IPv6 address counts as its IPv4 address. Anything else is
 * returned unchanged.
 */
export function networkSubject(address: string): string {
  const value = address.trim().toLowerCase();
  if (!value.includes(':')) return value;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(value);
  if (mapped?.[1]) return mapped[1];
  const halves = value.split('::');
  if (halves.length > 2) return value;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return value;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/u.test(group))) return value;
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/u, ''))
    .join(':');
  return `${prefix}::/64`;
}
