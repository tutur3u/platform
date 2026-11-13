import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PageTransition, TasksPageLoading } from './page-transition';

afterEach(cleanup);

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
