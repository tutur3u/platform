export const nativeSecurityPages = [
  {
    kind: 'security-policy',
    slug: 'security/policy',
    source: 'apps/web/src/app/[locale]/(marketing)/security/policy/page.tsx',
  },
  {
    kind: 'bug-bounty',
    slug: 'security/bug-bounty',
    source:
      'apps/web/src/app/[locale]/(marketing)/security/bug-bounty/page.tsx',
  },
] as const;

export type NativeSecurityKind = (typeof nativeSecurityPages)[number]['kind'];

export function nativeSecurityPage(kind: NativeSecurityKind) {
  const page = nativeSecurityPages.find((candidate) => candidate.kind === kind);
  if (!page) throw new Error(`Unknown native security page: ${kind}`);
  return page;
}

export function shouldRenderNativeSecurity(
  request: Request,
  flag: string | undefined
) {
  return (
    flag === 'on' &&
    ['GET', 'HEAD'].includes(request.method) &&
    nativeSecurityPages.some(({ slug }) =>
      [`/${slug}`, `/en/${slug}`, `/vi/${slug}`].includes(
        new URL(request.url).pathname
      )
    ) &&
    ![
      'rsc',
      'next-action',
      'next-router-state-tree',
      'next-router-prefetch',
    ].some((name) => request.headers.has(name))
  );
}
