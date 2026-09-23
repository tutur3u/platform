/** Subscription context must not silently lose older coverage or attendance. */
export async function readSubscriptionPages<T>(
  fetchPage: (
    offset: number,
    limit: number
  ) => PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>
) {
  const data: T[] = [];
  const limit = 500;
  let expected: number | undefined;
  for (let offset = 0; ; offset += limit) {
    const page = await fetchPage(offset, limit);
    if (page.error) return { data: null, error: page.error };
    if (
      page.count === null ||
      page.count > 50_000 ||
      !page.data ||
      (expected !== undefined && expected !== page.count) ||
      page.data.length !== Math.min(limit, page.count - offset)
    ) {
      return {
        data: null,
        error: new Error('Incomplete subscription context'),
      };
    }
    expected = page.count;
    data.push(...page.data);
    if (data.length === expected) return { data, error: null };
  }
}
