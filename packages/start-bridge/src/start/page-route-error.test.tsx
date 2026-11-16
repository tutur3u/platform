import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBridgePageRoute, createBridgeRootRoute } from './page-route';

describe('bridge page loader errors during SSR', () => {
  it.each([
    { path: '/personal/timer', locale: 'en', retry: 'Try again' },
    { path: '/vi/personal/timer', locale: 'vi', retry: 'Thử lại' },
  ])('renders a safe $locale error page', async ({ path, locale, retry }) => {
    const upstreamHtml =
      '<!doctype html><html><title>Attention Required! | Cloudflare</title><body>upstream-block-marker</body></html>';
    const root = createRootRoute({
      ...createBridgeRootRoute({ appName: 'Track' }),
      component: Outlet,
    });
    const page = createRoute({
      getParentRoute: () => root,
      path: '$',
      ...createBridgePageRoute({
        load: async () => {
          throw new Error(upstreamHtml);
        },
      }),
    });
    const router = createRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: [path] }),
      isServer: true,
    });

    await router.load();
    expect(router.state.matches.at(-1)?.status).toBe('error');
    const html = renderToString(<RouterProvider router={router} />);

    expect(html).toContain('data-status-page="error"');
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(retry);
    expect(html).not.toContain('upstream-block-marker');
    expect(html).not.toContain('Attention Required!');
    expect(html).not.toContain('Something went wrong!');
    expect(html).not.toContain('&lt;!doctype');
  });
});
