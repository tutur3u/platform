/**
 * The trust boundary of the control modules. Anything derived from a
 * Cloudflare or GitHub API response, a gateway `list()` result, a verifier
 * report or a key-guard response is untrusted and enters only as JSON text.
 * Host adapters pass the response bodies (or text they serialize from them)
 * as strings, never as parsed objects. The text is parsed here with
 * `parseStrictJson`: a duplicate member name fails the parse, objects have no
 * prototype, so `__proto__` is an ordinary own member, and numbers are
 * canonical safe integers. Only the traffic version and deployment texts,
 * whose `percentage` Cloudflare types as a number from 0.01 to 100, are parsed
 * under the canonical `finiteDecimal` policy.
 *
 * Every container the parse yields is frozen and recorded. The readers below
 * accept only recorded containers, so a value that did not come from this
 * parser, such as a getter, a Proxy or an array with an overridden iterator,
 * reads as malformed rather than as data, and a parsed value cannot change
 * between the check that reads it and the code that acts on it.
 */
import {
  type JsonValue,
  parseStrictJson,
  type StrictJsonNumbers,
} from '../encoding';

/**
 * Container nesting allowed below the root of a control input. A member
 * listing's scope `objects[].key` sits ten levels down; the margin covers
 * fields the classifier never reads.
 */
export const CONTROL_JSON_MAX_DEPTH = 16;

export type JsonRecord = Readonly<{ [key: string]: JsonValue }>;

const parsed = new WeakSet<object>();

function seal(value: JsonValue): void {
  if (typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      seal(value[index] as JsonValue);
    }
  } else {
    for (const key of Object.keys(value)) seal(value[key] as JsonValue);
  }
  Object.freeze(value);
  parsed.add(value);
}

/**
 * Parses one untrusted control input. Anything but a string, invalid JSON, a
 * duplicate member name, a number outside the `numbers` policy (canonical
 * safe integers unless a caller asks for `finiteDecimal`) or deeper nesting is
 * `undefined`, which every reader treats as a failed read.
 */
export function parseControlJson(
  text: unknown,
  numbers: StrictJsonNumbers = 'safeInteger'
): JsonValue | undefined {
  if (typeof text !== 'string') return undefined;
  const value = parseStrictJson(text, CONTROL_JSON_MAX_DEPTH, numbers);
  if (value !== undefined) seal(value);
  return value;
}

/** A parsed array, or null for anything else. */
export function jsonArray(value: unknown): readonly JsonValue[] | null {
  return Array.isArray(value) && parsed.has(value)
    ? (value as JsonValue[])
    : null;
}

/** A parsed object, or null for anything else. */
export function jsonRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    parsed.has(value)
    ? (value as JsonRecord)
    : null;
}

/** A member of a parsed object; an absent member is `undefined`. */
export function jsonField(
  record: JsonRecord,
  key: string
): JsonValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Whether every number in a parsed value is a safe integer. A field parsed
 * under the `finiteDecimal` policy uses it to keep its nested members, such
 * as a version's bindings, on the integer policy.
 */
export function onlySafeIntegers(
  value: JsonValue | readonly JsonValue[] | undefined
): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'object' || value === null) return true;
  if (Array.isArray(value)) {
    const items = value as readonly JsonValue[];
    for (let index = 0; index < items.length; index += 1) {
      if (!onlySafeIntegers(items[index])) return false;
    }
    return true;
  }
  const record = value as JsonRecord;
  for (const key of Object.keys(record)) {
    if (!onlySafeIntegers(record[key])) return false;
  }
  return true;
}
