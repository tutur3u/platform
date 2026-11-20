// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraSoulScopeProvider } from '@/components/mira-soul-scope';
import {
  LIVE_ELIGIBILITY_QUERY_KEY,
  liveEligibilityQueryKey,
  useLiveEligibility,
} from './use-live-eligibility';

const auth = vi.hoisted(() => ({
  listeners: new Set<
    (
      event: string,
      session: { user: { id: string; last_sign_in_at?: string } } | null
    ) => void
  >(),
}));
const api = vi.hoisted(() => ({ getLiveEligibility: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (
        callback: (
          event: string,
          session: {
            user: { id: string; last_sign_in_at?: string };
          } | null
        ) => void
      ) => {
        auth.listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => auth.listeners.delete(callback),
            },
          },
        };
      },
    },
  }),
}));
vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  getLiveEligibility: api.getLiveEligibility,
}));

const blocked = {
  eligible: false,
  reason: 'plan_required' as const,
  tier: 'FREE',
  billing: { name: 'Actor A personal', personal: true },
  params: { plans: ['PLUS', 'PRO', 'ENTERPRISE'] },
};
const args = { creditSource: 'personal' as const, wsId: 'ws-1' };

const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  auth.listeners.clear();
  vi.clearAllMocks();
});

function setup(actorId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MiraSoulScopeProvider actorId={actorId} sessionRevision="rev-1">
        {children}
      </MiraSoulScopeProvider>
    </QueryClientProvider>
  );
  return { client, ...renderHook(() => useLiveEligibility(args), { wrapper }) };
}

function switchSession(userId: string, revision?: string, event = 'SIGNED_IN') {
  act(() => {
    for (const listener of auth.listeners) {
      listener(event, { user: { id: userId, last_sign_in_at: revision } });
    }
  });
}

function cachedEligibility(client: QueryClient) {
  return client
    .getQueriesData({ queryKey: [LIVE_ELIGIBILITY_QUERY_KEY] })
    .map(([, data]) => data)
    .filter(Boolean);
}

it('keys the cache by the verified actor and session revision', () => {
  const key = (actorId: string, sessionRevision: string) =>
    liveEligibilityQueryKey({ ...args, actorId, sessionRevision });
  expect(key('actor-a', 'rev-1')).not.toEqual(key('actor-b', 'rev-1'));
  expect(key('actor-a', 'rev-1')).not.toEqual(key('actor-a', 'rev-2'));
});

it('discards an in-flight result when the session changes', async () => {
  let release!: (value: typeof blocked) => void;
  api.getLiveEligibility.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const { client, result } = setup('actor-a');
  await waitFor(() => expect(api.getLiveEligibility).toHaveBeenCalledOnce());

  // Another tab signs in as actor B while actor A's request is pending.
  switchSession('actor-b');
  await act(async () => {
    release(blocked);
  });

  expect(result.current.status).not.toBe('blocked');
  expect(
    client
      .getQueriesData({ queryKey: [LIVE_ELIGIBILITY_QUERY_KEY] })
      .map(([, data]) => data)
      .filter(Boolean)
  ).toEqual([]);
});

it('removes cached eligibility when the authenticated actor changes', async () => {
  api.getLiveEligibility.mockResolvedValue(blocked);
  const { client, result } = setup('actor-a');
  await waitFor(() => expect(result.current.status).toBe('blocked'));
  expect(
    client.getQueriesData({ queryKey: [LIVE_ELIGIBILITY_QUERY_KEY] })
  ).not.toEqual([]);

  switchSession('actor-b');

  expect(
    client
      .getQueriesData({ queryKey: [LIVE_ELIGIBILITY_QUERY_KEY] })
      .map(([, data]) => data)
      .filter(Boolean)
  ).toEqual([]);
});

it('a new sign-in by the same actor discards in-flight results', async () => {
  let release!: (value: typeof blocked) => void;
  api.getLiveEligibility.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const { client, result } = setup('actor-a');
  await waitFor(() => expect(api.getLiveEligibility).toHaveBeenCalledOnce());

  // Same actor signs in again in another tab: a new session revision.
  switchSession('actor-a', 'rev-2');
  await act(async () => {
    release(blocked);
  });

  expect(result.current.status).not.toBe('blocked');
  expect(cachedEligibility(client)).toEqual([]);
});

it('a new sign-in by the same actor clears cached eligibility', async () => {
  api.getLiveEligibility.mockResolvedValue(blocked);
  const { client, result } = setup('actor-a');
  await waitFor(() => expect(result.current.status).toBe('blocked'));

  switchSession('actor-a', 'rev-2');

  expect(cachedEligibility(client)).toEqual([]);
});

it('a token refresh in the same session keeps cached eligibility', async () => {
  api.getLiveEligibility.mockResolvedValue(blocked);
  const { client, result } = setup('actor-a');
  await waitFor(() => expect(result.current.status).toBe('blocked'));

  switchSession('actor-a', 'rev-1', 'TOKEN_REFRESHED');

  expect(cachedEligibility(client)).not.toEqual([]);
});
