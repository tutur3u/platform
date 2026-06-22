import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from './next-navigation-shim';

/**
 * Runtime proof that the next/navigation shim's hooks resolve against a REAL
 * TanStack Router (memory history, SSR via renderToString — the TanStack Start
 * scenario). This is the runtime verification the build smoke-test would give:
 * the shared @tuturuuu/ui clients call exactly these hooks, and here they read
 * the router's location/params instead of throwing the next/navigation
 * invariant. The imperative useRouter() methods are covered separately by the
 * pure-adapter unit test (next-navigation-shim.test.ts).
 */
function Probe() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ wsId: string }>();
  // Exercise useRouter() so a throw here (missing router context / bad API
  // mapping) fails the render; the methods themselves are unit-tested.
  const router = useRouter();
  const routerOk =
    typeof router.push === 'function' && typeof router.refresh === 'function';

  return (
    <div>
      {`path=${pathname}|q=${searchParams.get('q') ?? ''}|ws=${
        params.wsId ?? ''
      }|router=${routerOk ? 'ok' : 'bad'}`}
    </div>
  );
}

async function renderAt(initialEntry: string): Promise<string> {
  const rootRoute = createRootRoute();
  const probeRoute = createRoute({
    component: Probe,
    getParentRoute: () => rootRoute,
    path: '/$wsId/boards',
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([probeRoute]),
  });
  await router.load();
  // The test router intentionally differs from the app's registered router.
  return renderToString(<RouterProvider router={router as unknown as never} />);
}

describe('next-navigation-shim hooks (TanStack Router SSR)', () => {
  it('usePathname/useSearchParams/useParams/useRouter resolve from the router', async () => {
    const html = await renderAt('/acme/boards?q=hello&page=2');

    expect(html).toContain('path=/acme/boards');
    expect(html).toContain('q=hello');
    expect(html).toContain('ws=acme');
    expect(html).toContain('router=ok');
  });

  it('returns empty search when the location has no query string', async () => {
    const html = await renderAt('/beta/boards');

    expect(html).toContain('path=/beta/boards');
    expect(html).toContain('q=|');
    expect(html).toContain('ws=beta');
  });
});
