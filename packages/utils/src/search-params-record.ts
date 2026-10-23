export type SearchParamsRecord = Record<string, string | string[]>;

/**
 * Collect query parameters into a plain record for schema validation without
 * writing request-controlled names onto an object (`__proto__`, `toString`,
 * ...). Values are grouped in a Map first; repeated keys become arrays unless
 * `repeated` is `'last'`, which keeps only the final value.
 */
export function searchParamsToRecord(
  searchParams: URLSearchParams,
  { repeated = 'array' }: { repeated?: 'array' | 'last' } = {}
): SearchParamsRecord {
  const grouped = new Map<string, string[]>();
  searchParams.forEach((value, key) => {
    const values = grouped.get(key);
    if (!values) grouped.set(key, [value]);
    else if (repeated === 'last') values.splice(0, values.length, value);
    else values.push(value);
  });
  return Object.fromEntries(
    Array.from(grouped, ([key, values]) => [
      key,
      values.length === 1 ? values[0]! : values,
    ])
  );
}
