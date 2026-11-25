// Tasks pages served to signed-out viewers. Each pattern is anchored and
// bounded: an app-relative path with the locale prefix removed must match it
// exactly, so neighbours (other `/shared/*` pages, extra segments, a trailing
// slash, non-hex codes) still require a session.

// Public board link codes are `encode(gen_random_bytes(18), 'hex')` (36 hex
// characters) and at least 24 characters by the table constraint; lookups
// lowercase the code.
const PUBLIC_TASK_BOARD_PATH = /^\/shared\/task-boards\/[0-9a-f]{24,64}$/iu;
const LOCALE_PREFIX = /^\/(?:en|vi)(?=\/|$)/u;

/** `path` is app-relative and locale-free, as mounted auth passes it. */
export function isPublicTasksPage(path: string): boolean {
  return PUBLIC_TASK_BOARD_PATH.test(path);
}

/** Subdomain requests carry the locale prefix; strip it before matching. */
export function isPublicTasksPathname(pathname: string): boolean {
  return isPublicTasksPage(pathname.replace(LOCALE_PREFIX, ''));
}
