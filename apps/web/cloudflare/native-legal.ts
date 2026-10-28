export const nativeLegalPages = [
  {
    kind: 'privacy',
    slug: 'privacy',
    seoKey: 'privacy',
    source: 'apps/web/src/app/[locale]/(marketing)/privacy/page.tsx',
  },
  {
    kind: 'terms',
    slug: 'terms',
    seoKey: 'terms',
    source: 'apps/web/src/app/[locale]/(marketing)/terms/page.tsx',
  },
  {
    kind: 'acceptable-use',
    slug: 'acceptable-use',
    seoKey: 'acceptable_use',
    source: 'apps/web/src/app/[locale]/(marketing)/acceptable-use/page.tsx',
  },
  {
    kind: 'dpa',
    slug: 'legal/dpa',
    seoKey: 'legal_dpa',
    source: 'apps/web/src/app/[locale]/(marketing)/legal/dpa/page.tsx',
  },
  {
    kind: 'sla',
    slug: 'legal/sla',
    seoKey: 'legal_sla',
    source: 'apps/web/src/app/[locale]/(marketing)/legal/sla/page.tsx',
  },
  {
    kind: 'subprocessors',
    slug: 'legal/subprocessors',
    seoKey: 'legal_subprocessors',
    source:
      'apps/web/src/app/[locale]/(marketing)/legal/subprocessors/page.tsx',
  },
] as const;

export type NativeLegalKind = (typeof nativeLegalPages)[number]['kind'];

export function nativeLegalPage(kind: NativeLegalKind) {
  const page = nativeLegalPages.find((candidate) => candidate.kind === kind);
  if (!page) throw new Error(`Unknown native legal page: ${kind}`);
  return page;
}

export function nativeLegalPath(path: string) {
  return nativeLegalPages.some(({ slug }) =>
    [`/${slug}`, `/en/${slug}`, `/vi/${slug}`].includes(path)
  );
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
