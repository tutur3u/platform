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
  let sameOrigin: boolean | null = null;
  try {
    if (destination !== undefined) {
      const from = new URL(source);
      const to = new URL(destination);
      sameOrigin = from.origin === to.origin;
      samePath = sameOrigin && from.pathname === to.pathname;
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
    sameOrigin,
  };
}

export function profileProxyProvenance(value: string | undefined) {
  const match = value?.match(
    /^(canonical-locale|canonical-public|verify-token|login|auth-login|workspace-route-status|intl)\|(en|vi|unprefixed)\|(en|vi|unprefixed)\|(same|different)$/u
  );
  if (!match) return {};
  return {
    proxy: {
      stage: match[1],
      requestLocale: match[2],
      nextLocale: match[3],
      sameRequestPath: match[4] === 'same',
    },
  };
}

function responseProxyProvenance(response: Response) {
  try {
    return profileProxyProvenance(
      response.headers?.()['x-lettin-profile-proxy']
    );
  } catch {
    return {};
  }
}

export async function observeProfileNavigation<T>(
  page: Page,
  origin: string | undefined,
  navigate: () => Promise<T>
): Promise<T> {
  const responses: {
    item: Response;
    status: number;
    body: 'pending' | 'finished' | 'failed' | 'unavailable';
  }[] = [];
  let domContentLoaded = false;
  let load = false;
  const onDomContentLoaded = () => {
    domContentLoaded = true;
  };
  const onLoad = () => {
    load = true;
  };
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
      const observed: (typeof responses)[number] = {
        item,
        status,
        body: 'unavailable',
      };
      responses.push(observed);
      if (typeof item.finished === 'function') {
        observed.body = 'pending';
        void item.finished().then(
          (error) => {
            observed.body = error ? 'failed' : 'finished';
          },
          () => {
            observed.body = 'failed';
          }
        );
      }
    } catch {
      // Observation must never change navigation or authentication behavior.
    }
  };
  page.on('response', response);
  page.on('domcontentloaded', onDomContentLoaded);
  page.on('load', onLoad);
  try {
    return await navigate();
  } catch (error) {
    const diagnostics = {
      lifecycle: { domContentLoaded, load },
      hops: responses.map(({ item, status, body }) => {
        try {
          return {
            ...profileNavigationEdge(
              item.url(),
              item.request().redirectedTo()?.url(),
              origin
            ),
            ...responseProxyProvenance(item),
            status,
            body,
          };
        } catch {
          return {
            route: 'unparseable',
            locale: 'unparseable',
            targetRoute: 'unavailable',
            targetLocale: 'unavailable',
            samePath: null,
            sameOrigin: null,
            status,
            body,
          };
        }
      }),
      truncated,
    };
    // Preserve nested fixed categories in CI logs instead of opaque [Object].
    console.warn(
      '[lettin-e2e] profile navigation diagnostics',
      JSON.stringify(diagnostics)
    );
    throw error;
  } finally {
    page.off('response', response);
    page.off('domcontentloaded', onDomContentLoaded);
    page.off('load', onLoad);
  }
}
