import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isNotFound,
  isRedirect,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CalendarParamsContext,
  notFound,
  permanentRedirect,
  redirect,
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from './next-navigation';

afterEach(cleanup);

async function fixture(logical: Record<string, string> = {}) {
  let revision = 0;
  const preloaded = vi.fn(() => 'preloaded destination');
  const root = createRootRoute({
    loader: () => ++revision,
    component: () => (
      <CalendarParamsContext.Provider value={logical}>
        <Outlet />
      </CalendarParamsContext.Provider>
    ),
  });
  function Probe() {
    const pathname = usePathname();
    const search = useSearchParams();
    const params = useParams();
    const navigation = useRouter();
    const loadedRevision = root.useLoaderData();
    return (
      <>
        <output data-testid="path">{pathname}</output>
        <output data-testid="search">{JSON.stringify([...search])}</output>
        <output data-testid="params">{JSON.stringify(params)}</output>
        <output data-testid="revision">{loadedRevision}</output>
        <button
          type="button"
          onClick={() =>
            navigation.push('/boards/pushed?x=a%2Bb&x=two', { scroll: false })
          }
        >
          push
        </button>
        <button
          type="button"
          onClick={() => navigation.replace('/boards/replaced')}
        >
          replace
        </button>
        <button type="button" onClick={() => navigation.back()}>
          back
        </button>
        <button type="button" onClick={() => navigation.forward()}>
          forward
        </button>
        <button type="button" onClick={() => navigation.refresh()}>
          refresh
        </button>
        <button
          type="button"
          onClick={() => navigation.prefetch('/other/prefetched')}
        >
          prefetch
        </button>
      </>
    );
  }
  const board = createRoute({
    getParentRoute: () => root,
    path: '/boards/$boardId',
    component: Probe,
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other/$boardId',
    loader: preloaded,
    component: Probe,
  });
  const history = createMemoryHistory({
    initialEntries: ['/boards/native?tag=a%2Bb&tag=two%20words&encoded=%26%3D'],
  });
  const router = createRouter({
    routeTree: root.addChildren([board, other]),
    history,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await waitFor(() =>
    expect(screen.getByTestId('path').textContent).toBe('/boards/native')
  );
  return { router, history, preloaded };
}

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function thrown(action: () => never): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('navigation control returned instead of throwing');
}

describe('Calendar navigation on a real TanStack memory router', () => {
  it('reads pathname, TanStack-normalized duplicate queries, encoded values and native params', async () => {
    await fixture();
    expect(screen.getByTestId('search').textContent).toBe(
      JSON.stringify([
        ['tag', '["a+b","two words"]'],
        ['encoded', '&='],
      ])
    );
    expect(JSON.parse(screen.getByTestId('params').textContent ?? '')).toEqual({
      boardId: 'native',
    });
  });

  it('gives logical params precedence and includes logical locale', async () => {
    await fixture({ boardId: 'logical', locale: 'vi' });
    expect(JSON.parse(screen.getByTestId('params').textContent ?? '')).toEqual({
      boardId: 'logical',
      locale: 'vi',
    });
  });

  it('retains native params alongside additional logical params', async () => {
    await fixture({ locale: 'vi' });
    expect(JSON.parse(screen.getByTestId('params').textContent ?? '')).toEqual({
      boardId: 'native',
      locale: 'vi',
    });
  });

  it('pushes, replaces and traverses the actual history with updated hook output', async () => {
    const { history } = await fixture();
    click('push');
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/boards/pushed')
    );
    expect(history.location.pathname).toBe('/boards/pushed');
    expect(screen.getByTestId('search').textContent).toBe(
      JSON.stringify([['x', '["a+b","two"]']])
    );
    click('replace');
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/boards/replaced')
    );
    expect(screen.getByTestId('search').textContent).toBe('[]');
    click('back');
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/boards/native')
    );
    expect(history.location.pathname).toBe('/boards/native');
    click('forward');
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/boards/replaced')
    );
    expect(history.location.pathname).toBe('/boards/replaced');
  });

  it('refreshes rendered loader data and preloads without changing the current URL', async () => {
    const { history, preloaded } = await fixture();
    const initialRevision = Number(screen.getByTestId('revision').textContent);
    const initialHref = history.location.href;
    click('refresh');
    await waitFor(() =>
      expect(
        Number(screen.getByTestId('revision').textContent)
      ).toBeGreaterThan(initialRevision)
    );
    expect(history.location.href).toBe(initialHref);
    click('prefetch');
    await waitFor(() => expect(preloaded).toHaveBeenCalledTimes(1));
    expect(history.location.href).toBe(initialHref);
    expect(screen.getByTestId('path').textContent).toBe('/boards/native');
    expect(screen.getByTestId('params').textContent).toContain('native');
  });

  it('throws real redirect and not-found controls with the permanent status preserved', () => {
    const temporary = thrown(() => redirect('/login?returnTo=%2Fpersonal'));
    expect(isRedirect(temporary)).toBe(true);
    if (!isRedirect(temporary)) throw new Error('expected TanStack redirect');
    expect(temporary.options.href).toBe('/login?returnTo=%2Fpersonal');
    expect(temporary.status).toBe(307);
    expect(temporary.headers.get('location')).toBe(
      '/login?returnTo=%2Fpersonal'
    );
    const permanent = thrown(() => permanentRedirect('/personal'));
    expect(isRedirect(permanent)).toBe(true);
    if (!isRedirect(permanent)) throw new Error('expected TanStack redirect');
    expect(permanent.options.href).toBe('/personal');
    expect(permanent.status).toBe(308);
    expect(permanent.headers.get('location')).toBe('/personal');
    const missing = thrown(notFound);
    expect(isNotFound(missing)).toBe(true);
    expect(isRedirect(missing)).toBe(false);
    expect(isNotFound(new Error('ordinary failure'))).toBe(false);
    expect(isRedirect(new Error('ordinary failure'))).toBe(false);
  });
});
