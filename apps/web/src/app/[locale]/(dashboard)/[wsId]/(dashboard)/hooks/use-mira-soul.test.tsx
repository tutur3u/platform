import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraSoulScopeProvider } from '@/components/mira-soul-scope';
import { useMiraSoul, useUpdateMiraSoul } from './use-mira-soul';

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));
const key = ['mira-soul', 'detail', 'actor-a'];
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MiraSoulScopeProvider actorId="actor-a">
          {children}
        </MiraSoulScopeProvider>
      </QueryClientProvider>
    );
  }
  return { client, wrapper };
}
afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
  vi.unstubAllGlobals();
});
it('rejects a malformed authoritative Soul receipt', async () => {
  const { wrapper } = setup();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ soul: { name: 7 } }), { status: 200 })
      )
  );
  const { result } = renderHook(() => useMiraSoul(), { wrapper });
  await waitFor(() => expect(result.current.isFetching).toBe(false));
  expect(result.current.isError).toBe(true);
  expect(result.current.data).toBeUndefined();
});
it('does not roll back a newer confirmed cache publication when an older rename fails', async () => {
  const { client, wrapper } = setup();
  client.setQueryData(key, { soul: { name: 'Initial' } });
  let reject!: (reason: Error) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((_resolve, fail) => {
          reject = fail;
        })
    )
  );
  const { result } = renderHook(() => useUpdateMiraSoul(), { wrapper });
  let outcome!: Promise<unknown>;
  act(() => {
    outcome = result.current
      .mutateAsync({ name: 'Optimistic' })
      .catch((error) => error);
  });
  await waitFor(() =>
    expect(client.getQueryData(key)).toEqual({ soul: { name: 'Optimistic' } })
  );
  client.setQueryData(key, { soul: { name: 'Confirmed tool name' } });
  await act(async () => {
    reject(new Error('Synthetic failure'));
    await outcome;
  });
  expect(client.getQueryData(key)).toEqual({
    soul: { name: 'Confirmed tool name' },
  });
});

it('does not restore an older snapshot after the actor cache is cleared and recreated', async () => {
  const { client, wrapper } = setup();
  client.setQueryData(key, { soul: { name: 'Initial' } });
  let reject!: (reason: Error) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((_resolve, fail) => {
          reject = fail;
        })
    )
  );
  const { result } = renderHook(() => useUpdateMiraSoul(), { wrapper });
  let outcome!: Promise<unknown>;
  act(() => {
    outcome = result.current
      .mutateAsync({ name: 'Optimistic' })
      .catch((error) => error);
  });
  await waitFor(() =>
    expect(client.getQueryData(key)).toEqual({ soul: { name: 'Optimistic' } })
  );
  client.removeQueries({ queryKey: key, exact: true });
  client.setQueryData(key, { soul: { name: 'New session cache' } });
  await act(async () => {
    reject(new Error('Synthetic failure'));
    await outcome;
  });
  expect(client.getQueryData(key)).toEqual({
    soul: { name: 'New session cache' },
  });
});
