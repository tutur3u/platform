import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { APP_BASE_GLOBAL } from '@tuturuuu/start-bridge/app-url';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { skipTaskBoardEntrypointPreload } from './page-path';
import { PageTransition, TasksPageLoading } from './page-transition';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('hides the resolved board while the real router waits for another workspace', async () => {
  let finish: (() => void) | undefined;
  const slow = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '$',
    loader: async ({ location }) => {
      if (location.pathname === '/ws-b/boards/b') await slow;
      return { path: location.pathname };
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: TasksPageLoading,
    component: () => {
      const { path } = route.useLoaderData();
      return (
        <PageTransition loadedPath={path}>
          <div>Board {path}</div>
        </PageTransition>
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/ws-a/boards/a'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  expect(screen.getByText('Board /ws-a/boards/a')).toBeTruthy();
  let navigation: Promise<void> | undefined;
  await act(async () => {
    navigation = router.navigate({
      to: '/$',
      params: { _splat: 'ws-b/boards/b' },
    });
  });
  expect(router.state.location.pathname).toBe('/ws-b/boards/b');
  await waitFor(() =>
    expect(screen.queryByText('Board /ws-a/boards/a')).toBeNull()
  );
  expect(screen.getByRole('progressbar')).toBeTruthy();
  await act(async () => {
    finish?.();
    await navigation;
  });
  expect(screen.getByText('Board /ws-b/boards/b')).toBeTruthy();
});

it.each([false, true])(
  'loads a localized task entrypoint after intent (wait for preload: %s)',
  async (waitForPreload) => {
    vi.stubGlobal(APP_BASE_GLOBAL, '/tasks');
    const root = createRootRoute({
      component: Outlet,
      notFoundComponent: () => <div>Not found</div>,
    });
    const loads: boolean[] = [];
    const route = createRoute({
      getParentRoute: () => root,
      path: '$',
      beforeLoad: skipTaskBoardEntrypointPreload,
      loader: ({ preload, location }) => {
        if (location.pathname.endsWith('/vi/ws-a/tasks')) loads.push(preload);
        return location.pathname;
      },
      component: () => <div>{route.useLoaderData()}</div>,
    });
    const router = createRouter({
      basepath: '/tasks',
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: ['/tasks/ws-a/boards/a'],
      }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    const target = { to: '/$' as const, params: { _splat: 'vi/ws-a/tasks' } };
    await act(async () => {
      const intent = router.preloadRoute(target);
      if (waitForPreload) await intent;
      await Promise.all([intent, router.navigate(target)]);
    });
    expect(screen.getByText(/\/vi\/ws-a\/tasks$/)).toBeTruthy();
    expect(loads).toEqual([false]);
  }
);

it.each([
  '/tasks/vi/ws-a//tasks',
  '/tasks/en//ws-a/boards',
  '/tasks//ws-a/tasks',
])('treats repeated slashes as entrypoint separators in %s', (pathname) => {
  vi.stubGlobal(APP_BASE_GLOBAL, '/tasks');
  expect(() =>
    skipTaskBoardEntrypointPreload({ location: { pathname }, preload: true })
  ).toThrow();
  expect(() =>
    skipTaskBoardEntrypointPreload({ location: { pathname }, preload: false })
  ).not.toThrow();
});
