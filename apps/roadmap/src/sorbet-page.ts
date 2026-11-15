/**
 * The pages that render in the Sorbet design: the roadmap, in English and
 * Vietnamese (with or without the /roadmap mount and a trailing slash).
 * The root document sets data-ui="sorbet" on <html> for them in the server
 * HTML, so packages/ui's sorbet.css applies before any script runs. The
 * workshop pages keep the shared Tuturuuu tokens.
 */
export function sorbetPage(pathname: string): boolean {
  return /^(?:\/roadmap)?(?:\/vi)?\/?$/.test(pathname);
}
