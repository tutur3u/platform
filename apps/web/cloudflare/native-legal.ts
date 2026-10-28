export const nativeLegalPages = [
  {
    kind: 'privacy',
    source: 'apps/web/src/app/[locale]/(marketing)/privacy/page.tsx',
  },
  {
    kind: 'terms',
    source: 'apps/web/src/app/[locale]/(marketing)/terms/page.tsx',
  },
] as const;

export function nativeLegalPath(path: string) {
  return /^(?:\/(?:en|vi))?\/(?:privacy|terms)$/u.test(path);
}

export function shouldRenderNativeLegal(
  request: Request,
  flag: string | undefined
) {
  return (
    flag === 'on' &&
    ['GET', 'HEAD'].includes(request.method) &&
    nativeLegalPath(new URL(request.url).pathname) &&
    ![
      'rsc',
      'next-action',
      'next-router-state-tree',
      'next-router-prefetch',
    ].some((name) => request.headers.has(name))
  );
}
