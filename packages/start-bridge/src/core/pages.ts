import {
  compareRoutePatterns,
  matchRoute,
  type RouteParams,
} from './route-match';

export interface BridgePage<Pattern extends string = string> {
  /** App-relative pattern with route groups and stripped segments removed. */
  pattern: Pattern;
  /** Source `page.tsx`, relative to the app root. */
  file: string;
  defaults?: Record<string, string>;
}

/** Finds the most specific page for an app-relative pathname. */
export function matchPage<Page extends BridgePage>(
  pages: readonly Page[],
  pathname: string
): { page: Page; params: RouteParams } | null {
  for (const page of pages.toSorted((a, b) =>
    compareRoutePatterns(a.pattern, b.pattern)
  )) {
    const params = matchRoute(page.pattern, pathname);
    if (params) return { page, params: { ...page.defaults, ...params } };
  }
  return null;
}
