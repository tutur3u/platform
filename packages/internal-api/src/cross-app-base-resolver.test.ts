import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BridgeRequestContext,
  installRequestStore,
  withBridgeRequest,
} from '../../start-bridge/src/core/request-context';
import { createAppBaseResolver } from '../../start-bridge/src/start/app-base';
import {
  createInternalApiClient,
  registerDefaultAppBaseResolver,
  withFinanceApiBaseUrl,
  withTaskApiBaseUrl,
} from './client';
import { getUserConfig } from './users';

installRequestStore(new AsyncLocalStorage<BridgeRequestContext>());

// Finance's generated app-owned API patterns (a subset).
const FINANCE_PATTERNS = [
  '/api/workspaces/[wsId]/transactions',
  '/api/v1/workspaces/[wsId]/finance/budgets',
];

const unregister: Array<() => void> = [];
function register(
  resolver: Parameters<typeof registerDefaultAppBaseResolver>[0],
  app?: string
) {
  unregister.push(registerDefaultAppBaseResolver(resolver, { app }));
}

function mockFetch() {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// A request served by the Finance Worker mounted at tuturuuu.com/finance.
function inFinanceWorker<T>(work: () => Promise<T>) {
  return withBridgeRequest(
    {
      request: new Request('https://tuturuuu.com/finance/page'),
      appBase: '/finance',
    },
    work
  );
}

describe('cross-app helpers in a native Worker', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.example.com');
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.example.com');
    vi.stubEnv('FINANCE_APP_URL', 'https://finance.example.com');
  });
  afterEach(() => {
    for (const remove of unregister.splice(0)) remove();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends a task helper call from a Finance-tagged Worker to the Tasks origin', async () => {
    register(createAppBaseResolver(FINANCE_PATTERNS), 'finance');
    const fetch = mockFetch();
    await inFinanceWorker(() =>
      createInternalApiClient(withTaskApiBaseUrl()).fetch(
        '/api/v1/workspaces/ws-1/tasks'
      )
    );
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://tasks.example.com/api/v1/workspaces/ws-1/tasks'
    );
  });

  it('reaches the Tasks user-config route for TASK_* configs, not Web legacy', async () => {
    register(createAppBaseResolver(FINANCE_PATTERNS), 'finance');
    const fetch = mockFetch();
    await inFinanceWorker(async () => {
      await getUserConfig('TASK_REMEMBER_LAST_BOARD');
      await getUserConfig('SHOW_VERSION_BADGE');
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://tasks.example.com/api/v1/users/me/configs/TASK_REMEMBER_LAST_BOARD',
      // Non-task configs stay on the central Web API.
      'https://web.example.com/api/v1/users/me/configs/SHOW_VERSION_BADGE',
    ]);
  });

  it("keeps the app's own helper on its mount on the request host", async () => {
    register(createAppBaseResolver(FINANCE_PATTERNS), 'finance');
    const fetch = mockFetch();
    await inFinanceWorker(() =>
      createInternalApiClient(withFinanceApiBaseUrl()).fetch(
        '/api/workspaces/ws-1/transactions'
      )
    );
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://tuturuuu.com/finance/api/workspaces/ws-1/transactions'
    );
  });

  it("ignores a tagged resolver's claim on another app's path", async () => {
    // Finance happens to own the same path shape; the Tasks helper still wins.
    register(
      createAppBaseResolver(['/api/v1/workspaces/[wsId]/tasks']),
      'finance'
    );
    const fetch = mockFetch();
    await inFinanceWorker(() =>
      createInternalApiClient(withTaskApiBaseUrl()).fetch(
        '/api/v1/workspaces/ws-1/tasks'
      )
    );
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://tasks.example.com/api/v1/workspaces/ws-1/tasks'
    );
  });

  it('applies an untagged resolver to a cross-app call only when it claims the path', async () => {
    register(createAppBaseResolver(FINANCE_PATTERNS));
    expect(withTaskApiBaseUrl()).toEqual({
      crossAppBaseUrl: 'https://tasks.example.com',
    });
    const fetch = mockFetch();
    await inFinanceWorker(async () => {
      const finance = createInternalApiClient(withFinanceApiBaseUrl());
      await finance.fetch('/api/workspaces/ws-1/transactions');
      const tasks = createInternalApiClient(withTaskApiBaseUrl());
      await tasks.fetch('/api/v1/workspaces/ws-1/tasks');
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      // Claimed by the untagged resolver: stays on the Finance mount.
      'https://tuturuuu.com/finance/api/workspaces/ws-1/transactions',
      // Not claimed: the owning app's origin, as before #6764.
      'https://tasks.example.com/api/v1/workspaces/ws-1/tasks',
    ]);
  });

  it('always honours an explicit base', async () => {
    register(createAppBaseResolver(FINANCE_PATTERNS), 'finance');
    const fetch = mockFetch();
    await inFinanceWorker(async () => {
      await createInternalApiClient(
        withTaskApiBaseUrl({ baseUrl: 'https://explicit.invalid' })
      ).fetch('/api/v1/workspaces/ws-1/tasks');
      await createInternalApiClient(
        withFinanceApiBaseUrl({ baseUrl: 'https://explicit.invalid' })
      ).fetch('/api/workspaces/ws-1/transactions');
      await createInternalApiClient(withTaskApiBaseUrl()).fetch(
        '/api/v1/workspaces/ws-1/tasks',
        { baseUrl: 'https://per-call.invalid' }
      );
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://explicit.invalid/api/v1/workspaces/ws-1/tasks',
      'https://explicit.invalid/api/workspaces/ws-1/transactions',
      'https://per-call.invalid/api/v1/workspaces/ws-1/tasks',
    ]);
  });

  it('keeps the pre-#6764 per-app base when no resolver is registered', () => {
    expect(withTaskApiBaseUrl()).toEqual({
      baseUrl: 'https://tasks.example.com',
    });
  });
});
