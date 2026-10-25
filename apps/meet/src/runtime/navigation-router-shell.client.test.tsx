// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import {
  MeetParamsContext,
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from './next-navigation';
import { Pending } from './router-shell';

const initialHref =
  '/en/native-space/first?tag=one%2Ftwo&tag=three+four&encoded=%26%3D';
const pushedHref =
  '/vi/native-space/second?tag=a%2Fb&tag=two+words&encoded=%26%3D';
const replacedHref = '/en/native-space/replaced?keep=one%2Ftwo&keep=three';
const histories: ReturnType<typeof createMemoryHistory>[] = [];

// The adapter accepts URL query semantics, including repeated keys.
const urlSearchCodec = {
  parseSearch(search: string) {
    const values = new URLSearchParams(search);
    const parsed: Record<string, string[]> = {};
    for (const key of values.keys()) parsed[key] = values.getAll(key);
    return parsed;
  },
  stringifySearch(search: Record<string, unknown>) {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      const entries: unknown[] = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (typeof entry !== 'string') {
          throw new Error('Expected a URL query string value');
        }
        values.append(key, entry);
      }
    }
    const query = values.toString();
    return query ? `?${query}` : '';
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const history of histories.splice(0)) history.destroy();
});

async function mountNavigation(basepath = '/') {
  let revision = 1;
  const loader = vi.fn(() => ({ revision }));
  const preload = vi.fn(() => ({ ready: true }));
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: '$locale/$wsId/$meetingId',
    loader,
    component: NavigationProbe,
  });
  const prefetchPage = createRoute({
    getParentRoute: () => root,
    path: '/prefetched',
    loader: preload,
    component: () => <p>Prefetched destination</p>,
  });
  const history = createMemoryHistory({
    initialEntries: [
      basepath === '/' ? initialHref : `${basepath}${initialHref}`,
    ],
  });
  histories.push(history);
  const router = createRouter({
    routeTree: root.addChildren([page, prefetchPage]),
    basepath,
    history,
    ...urlSearchCodec,
    defaultPendingMinMs: 0,
  });

  function NavigationProbe(): ReactElement {
    const pathname = usePathname();
    const search = useSearchParams();
    const params: Record<string, string | undefined> = useParams();
    const navigation = useRouter();
    const data = page.useLoaderData<typeof router>();
    return (
      <main>
        <output data-testid="pathname">{pathname}</output>
        <output data-testid="query">
          {JSON.stringify(Array.from(search.entries()))}
        </output>
        <output data-testid="locale">{params.locale}</output>
        <output data-testid="workspace">{params.wsId}</output>
        <output data-testid="meeting">{params.meetingId}</output>
        <output data-testid="logical">{params.logicalOnly}</output>
        <p>Loader revision {data.revision}</p>
        <button type="button" onClick={() => navigation.push(pushedHref)}>
          Push
        </button>
        <button
          type="button"
          onClick={() => navigation.push(pushedHref, { scroll: false })}
        >
          Push preserving scroll
        </button>
        <button type="button" onClick={() => navigation.replace(replacedHref)}>
          Replace
        </button>
        <button
          type="button"
          onClick={() => navigation.replace(replacedHref, { scroll: false })}
        >
          Replace preserving scroll
        </button>
        <button type="button" onClick={() => navigation.back()}>
          Back
        </button>
        <button type="button" onClick={() => navigation.forward()}>
          Forward
        </button>
        <button type="button" onClick={() => navigation.refresh()}>
          Refresh
        </button>
        <button
          type="button"
          onClick={() => navigation.prefetch('/prefetched')}
        >
          Prefetch
        </button>
      </main>
    );
  }

  await router.load();
  render(
    <MeetParamsContext
      value={{
        locale: 'vi',
        meetingId: 'logical-meeting',
        logicalOnly: 'retained',
      }}
    >
      <RouterProvider router={router} />
    </MeetParamsContext>
  );
  await screen.findByText('Loader revision 1');
  return {
    history,
    router,
    loader,
    preload,
    changeRevision() {
      revision += 1;
    },
  };
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

function expectPath(pathname: string) {
  expect(screen.getByTestId('pathname').textContent).toBe(pathname);
}

describe('Meet navigation with a real TanStack router', () => {
  it('reads the pathname, decodes repeated query values and overlays logical params', async () => {
    await mountNavigation();
    expectPath('/en/native-space/first');
    expect(screen.getByTestId('query').textContent).toBe(
      JSON.stringify([
        ['tag', 'one/two'],
        ['tag', 'three four'],
        ['encoded', '&='],
      ])
    );
    expect(screen.getByTestId('locale').textContent).toBe('vi');
    expect(screen.getByTestId('meeting').textContent).toBe('logical-meeting');
    expect(screen.getByTestId('workspace').textContent).toBe('native-space');
    expect(screen.getByTestId('logical').textContent).toBe('retained');
  });

  it('pushes an entry, replaces that entry and traverses the actual history', async () => {
    const { history } = await mountNavigation();
    await click('Push');
    expectPath('/vi/native-space/second');
    expect(history.length).toBe(2);
    expect(history.location.pathname).toBe('/vi/native-space/second');
    expect(new URLSearchParams(history.location.search).getAll('tag')).toEqual([
      'a/b',
      'two words',
    ]);
    expect(screen.getByTestId('query').textContent).toBe(
      JSON.stringify([
        ['tag', 'a/b'],
        ['tag', 'two words'],
        ['encoded', '&='],
      ])
    );

    await click('Replace');
    expectPath('/en/native-space/replaced');
    expect(history.length).toBe(2);
    expect(new URLSearchParams(history.location.search).getAll('keep')).toEqual(
      ['one/two', 'three']
    );
    await click('Back');
    expectPath('/en/native-space/first');
    expect(history.location.pathname).toBe('/en/native-space/first');
    await click('Forward');
    expectPath('/en/native-space/replaced');
    expect(history.location.pathname).toBe('/en/native-space/replaced');
    expect(history.length).toBe(2);
  });

  it.each([
    { name: 'Push', reset: true, length: 2 },
    { name: 'Push preserving scroll', reset: false, length: 2 },
    { name: 'Replace', reset: true, length: 1 },
    { name: 'Replace preserving scroll', reset: false, length: 1 },
  ])(
    '$name commits the requested scroll reset',
    async ({ name, reset, length }) => {
      const { router, history } = await mountNavigation();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
        // Read the owning reset flag before the rendered event consumes it.
        expect(router._scroll.n).toBe(reset);
      });
      expect(history.length).toBe(length);
      expectPath(
        name.startsWith('Push')
          ? '/vi/native-space/second'
          : '/en/native-space/replaced'
      );
    }
  );

  it('refreshes the active loader and renders its new data without navigation', async () => {
    const { history, loader, changeRevision } = await mountNavigation();
    const callsBeforeRefresh = loader.mock.calls.length;
    const before = history.location;
    changeRevision();
    await click('Refresh');
    await screen.findByText('Loader revision 2');
    expect(loader.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
    expect(history.location).toEqual(before);
    expect(history.length).toBe(1);
    expectPath('/en/native-space/first');
  });

  it('prefetches the destination loader while keeping the active page and history', async () => {
    const { history, router, preload } = await mountNavigation();
    const before = history.location;
    expect(preload).not.toHaveBeenCalled();
    await click('Prefetch');
    expect(preload).toHaveBeenCalledTimes(1);
    const cached = router
      .matchRoutes('/prefetched', {})
      .find((match) => match.pathname === '/prefetched');
    expect(cached?.status).toBe('success');
    expect(cached?.loaderData).toEqual({ ready: true });
    expect(history.location).toEqual(before);
    expect(history.length).toBe(1);
    expectPath('/en/native-space/first');
    expect(screen.getByText('Loader revision 1')).toBeTruthy();
    expect(screen.queryByText('Prefetched destination')).toBeNull();
  });
});

describe('Meet pending shell', () => {
  it.each([
    { locale: 'en', labels: en.meet.loading, other: vietnamese.meet.loading },
    { locale: 'vi', labels: vietnamese.meet.loading, other: en.meet.loading },
  ])(
    'renders the actual $locale heading and status',
    async ({ locale, labels, other }) => {
      const root = createRootRoute({ component: Outlet });
      const pendingPage = createRoute({
        getParentRoute: () => root,
        path: '$locale/loading',
        component: Pending,
      });
      const history = createMemoryHistory({
        initialEntries: [`/${locale}/loading`],
      });
      histories.push(history);
      const router = createRouter({
        routeTree: root.addChildren([pendingPage]),
        history,
      });
      await router.load();
      render(<RouterProvider router={router} />);
      expect(
        (await screen.findByRole('heading', { level: 1 })).textContent
      ).toBe(labels.title);
      expect(screen.getByRole('status').textContent).toBe(labels.status);
      expect(screen.getByText(labels.hint)).toBeTruthy();
      expect(screen.queryByText(other.status)).toBeNull();
      expect(screen.queryByText(other.hint)).toBeNull();
    }
  );
});

it('reports an app-relative Next pathname under the mounted router base', async () => {
  vi.stubGlobal('__tuturuuuAppBase', '/meet');
  const { history } = await mountNavigation('/meet');
  expectPath('/en/native-space/first');
  expect(history.location.pathname).toBe('/meet/en/native-space/first');
});
