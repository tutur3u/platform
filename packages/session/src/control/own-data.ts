/**
 * Copies of trusted host values: the registry and config, Cloudflare ranges,
 * script lists, committed waivers and the host's own snapshots. They are host
 * code, not attacker data, yet each is copied once at entry into a fresh plain
 * structure so later steps never consult its prototype, a getter or an
 * overridable method again. Untrusted data never reaches these helpers; it
 * enters as JSON text through `untrusted-json`.
 */

/** An own data property; inherited and accessor fields read as absent. */
export function ownValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

/** The largest length an array can have. */
const MAX_ARRAY_LENGTH = 2 ** 32 - 1;

/**
 * A fresh array of an array's own data elements, read by index, or null when
 * the value is not an array, its own `length` is not an integer in
 * `0..2^32-1`, or it has a hole or an accessor element. The copy uses no
 * method of the input, so an overridden `slice`, iterator or `map` on its
 * prototype cannot change what is read.
 *
 * Residual: a Proxy over an array may report a shorter non-negative `length`
 * than its target holds, and the copy then drops the tail. Only trusted host
 * arrays reach this helper, never untrusted input, so the host would have to
 * proxy its own list for that to happen.
 */
export function ownElements(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const length = ownValue(value, 'length');
  if (
    typeof length !== 'number' ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > MAX_ARRAY_LENGTH
  ) {
    return null;
  }
  const elements: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    elements.push(descriptor.value);
  }
  return elements;
}

/** A fresh array of an array's own string elements, or null. */
export function ownStrings(value: unknown): string[] | null {
  const elements = ownElements(value);
  if (!elements) return null;
  const strings: string[] = [];
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (typeof element !== 'string') return null;
    strings.push(element);
  }
  return strings;
}
