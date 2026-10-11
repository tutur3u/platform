import type { Page, Response } from '@playwright/test';

const workspaceProfile =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/profile\/?$/iu;

export function profileNavigationRoute(
  value: string,
  origin: string | undefined
) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(origin ?? '').origin) return 'external';
    const pathname = url.pathname.replace(/^\/(?:en|vi)(?=\/)/u, '');
    if (workspaceProfile.test(pathname)) return 'profile';
    if (pathname === '/login') return 'login';
    if (pathname === '/verify-token') return 'verify-token';
    if (pathname === '/dashboard') return 'dashboard';
    return 'other-local';
  } catch {
    return 'unparseable';
  }
}

function navigationLocale(
  value: string | undefined,
  origin: string | undefined
) {
  if (value === undefined) return 'unavailable';
  try {
    const url = new URL(value);
    if (url.origin !== new URL(origin ?? '').origin) return 'external';
    return url.pathname.match(/^\/(en|vi)(?=\/)/u)?.[1] ?? 'unprefixed';
  } catch {
    return 'unparseable';
  }
}

export function profileNavigationEdge(
  source: string,
  destination: string | undefined,
  origin: string | undefined
) {
  let samePath: boolean | null = null;
  try {
    if (destination !== undefined) {
      const from = new URL(source);
      const to = new URL(destination);
      samePath = from.origin === to.origin && from.pathname === to.pathname;
    }
  } catch {
    /* Invalid destinations remain unknown. */
  }
  return {
    route: profileNavigationRoute(source, origin),
    locale: navigationLocale(source, origin),
    targetRoute:
      destination === undefined
        ? 'unavailable'
        : profileNavigationRoute(destination, origin),
    targetLocale: navigationLocale(destination, origin),
    samePath,
  };
}

export async function observeProfileNavigation<T>(
  page: Page,
  origin: string | undefined,
  navigate: () => Promise<T>
): Promise<T> {
  const responses: { item: Response; status: number }[] = [];
  let truncated = false;
  const response = (item: Response) => {
    try {
      if (
        !item.request().isNavigationRequest() ||
        item.frame() !== page.mainFrame()
      )
        return;
      if (responses.length === 20) {
        truncated = true;
        return;
      }
      const status = item.status();
      if (!Number.isInteger(status) || status < 100 || status > 599) return;
      responses.push({ item, status });
    } catch {
      // Observation must never change navigation or authentication behavior.
    }
  };
  page.on('response', response);
  try {
    return await navigate();
  } catch (error) {
    console.warn('[lettin-e2e] profile navigation diagnostics', {
      hops: responses.map(({ item, status }) => {
        try {
          return {
            ...profileNavigationEdge(
              item.url(),
              item.request().redirectedTo()?.url(),
              origin
            ),
            status,
          };
        } catch {
          return {
            route: 'unparseable',
            locale: 'unparseable',
            targetRoute: 'unavailable',
            targetLocale: 'unavailable',
            samePath: null,
            status,
          };
        }
      }),
      truncated,
    });
    throw error;
  } finally {
    page.off('response', response);
  }
}
