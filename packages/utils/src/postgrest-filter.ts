import { escapeLikePattern } from './search-helper';

/**
 * Quotes a value for a PostgREST logic-tree filter (`or`, `and`, ...) so that
 * `,`, `(`, `)` and `.` in user input stay part of one operand instead of
 * adding filters.
 */
export function quotePostgrestValue(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/**
 * `or` filter body matching `search` as a literal substring of any column
 * (`ilike`). LIKE wildcards in the input are escaped and the pattern is quoted,
 * so raw input can never add or widen a filter beyond the `%`/`_` wildcards.
 *
 * PostgREST maps `*` to `%` in `like`/`ilike` values, so a `*` in the input
 * still widens the match to anything within the rows the query can already
 * see. It is deliberately not stripped: the filter stays a narrowing one and
 * cannot add or reach another column or row set.
 */
export function buildPostgrestIlikeOrFilter(
  columns: readonly string[],
  search: string
) {
  const pattern = quotePostgrestValue(`%${escapeLikePattern(search)}%`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}
