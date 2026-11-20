const APEX = 'tuturuuu.com';
const BASE = '/lms';
const AREAS = ['teach', 'learn'] as const;

function under(path: string, base: string) {
  return path === base || path.startsWith(`${base}/`);
}

export function lmsRedirectDestination(request: Request): URL | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;

  const { host, pathname, search } = new URL(request.url);
  let target: string;

  if (host === `lms.${APEX}`) {
    target = under(pathname, BASE)
      ? pathname
      : `${BASE}${pathname === '/' ? '' : pathname}`;
  } else {
    const area = AREAS.find(
      (name) =>
        host === `${name}.${APEX}` ||
        (host === APEX && under(pathname, `/${name}`))
    );
    if (!area) return null;
    const suffix = host === APEX ? pathname.slice(area.length + 1) : pathname;
    target = `${BASE}/${area}${suffix === '/' ? '' : suffix}`;
  }

  const url = new URL(`https://${APEX}`);
  url.pathname = target;
  url.search = search;
  return url;
}
