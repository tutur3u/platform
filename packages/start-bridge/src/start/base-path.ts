/**
 * Build-time basePath for app code running in the browser or SSR. The Vite
 * preset defines `import.meta.env.VITE_TUTURUUU_BASE_PATH`; it is empty at
 * the origin root, so every helper is the identity there.
 */
export function appBasePath(): string {
  const value = import.meta.env?.VITE_TUTURUUU_BASE_PATH;
  return typeof value === 'string' ? value.replace(/\/+$/u, '') : '';
}

/** TanStack Router `basepath` option. */
export function routerBasepath(): string {
  return appBasePath() || '/';
}

/** Prefixes a path-absolute href with the app base (see `createBasePath`). */
export function withAppBase(href: string, basePath = appBasePath()): string {
  if (!basePath || !href.startsWith('/') || href.startsWith('//')) return href;
  if (href.startsWith('/\\')) return href;
  const end = href.search(/[?#]/u);
  const path = end === -1 ? href : href.slice(0, end);
  if (path === basePath || path.startsWith(`${basePath}/`)) return href;
  return `${basePath}${path === '/' ? '' : path}${end === -1 ? '' : href.slice(end)}`;
}
