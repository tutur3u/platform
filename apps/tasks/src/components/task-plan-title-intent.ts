/**
 * Task-title prefill for the Tasks composer (`/[wsId]/tasks/new?title=…`).
 * The command center sends what the user typed; the composer only seeds its
 * name field from it and never submits. Anything malformed is ignored so the
 * composer still opens empty.
 */
export const TASK_TITLE_INTENT_PARAM = 'title';
export const TASK_TITLE_INTENT_MAX_LENGTH = 500;
const INTENT_SOURCE_PARAM = 'source';
const INTENT_SOURCE_VALUE = 'command-launcher';

type ReadonlySearchParams = Pick<URLSearchParams, 'getAll'>;

export function parseTaskTitleIntent(
  search: ReadonlySearchParams | null | undefined
): string | null {
  const values = search?.getAll(TASK_TITLE_INTENT_PARAM) ?? [];
  if (values.length !== 1) return null;
  const title = (values[0] ?? '').replace(/\p{Cc}+/gu, ' ').trim();
  const length = [...title].length;
  if (length === 0 || length > TASK_TITLE_INTENT_MAX_LENGTH) return null;
  return title;
}

/**
 * The same URL without the consumed intent, or null when nothing changes.
 * Other query parameters (for example a Lettin source) are kept.
 */
export function urlWithoutTaskTitleIntent(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(TASK_TITLE_INTENT_PARAM)) return null;
  url.searchParams.delete(TASK_TITLE_INTENT_PARAM);
  if (url.searchParams.get(INTENT_SOURCE_PARAM) === INTENT_SOURCE_VALUE) {
    url.searchParams.delete(INTENT_SOURCE_PARAM);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
