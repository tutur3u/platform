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

export async function observeProfileNavigation<T>(
  page: Page,
  origin: string | undefined,
  navigate: () => Promise<T>
): Promise<T> {
  const hops: { route: string; status: number }[] = [];
  let truncated = false;
  const response = (item: Response) => {
    try {
      if (
        !item.request().isNavigationRequest() ||
        item.frame() !== page.mainFrame()
      )
        return;
      if (hops.length === 20) {
        truncated = true;
        return;
      }
      const status = item.status();
      if (!Number.isInteger(status) || status < 100 || status > 599) return;
      hops.push({ route: profileNavigationRoute(item.url(), origin), status });
    } catch {
      // Observation must never change navigation or authentication behavior.
    }
  };
  page.on('response', response);
  try {
    return await navigate();
  } catch (error) {
    console.warn('[lettin-e2e] profile navigation diagnostics', {
      hops,
      truncated,
    });
    throw error;
  } finally {
    page.off('response', response);
  }
}
