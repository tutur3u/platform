/** Base URL of the Mintlify docs site (apps/docs). */
export const DOCS_URL = 'https://docs.tuturuuu.com';

/**
 * Deep link to a component's generated reference page in apps/docs. Mirrors the
 * output of `scripts/generate-ui-component-docs.ts`.
 */
export function componentDocsUrl(slug: string) {
  return `${DOCS_URL}/platform/components/ui/${slug}`;
}
