export type SearchParamsRecord = Record<string, string | string[]>;

/**
 * Collect URL search params into a plain record for schema parsing.
 *
 * Keys come from the request, so entries are gathered in a `Map` and written
 * with `Object.fromEntries`, which defines own properties. A key such as
 * `__proto__` therefore stays an ordinary own property and can never replace
 * the record's prototype.
 *
 * Repeated keys keep the last value by default; pass `{ multi: true }` to
 * collect repeated keys into arrays (a single occurrence stays a string).
 */
export function searchParamsToRecord(
  searchParams: URLSearchParams,
  options: { multi?: boolean } = {}
): SearchParamsRecord {
  const entries = new Map<string, string | string[]>();

  searchParams.forEach((value, key) => {
    const existing = entries.get(key);

    if (!options.multi || existing === undefined) {
      entries.set(key, value);
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      entries.set(key, [existing, value]);
    }
  });

  return Object.fromEntries(entries);
}
