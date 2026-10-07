import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Suspense, startTransition, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraSoulScopeProvider } from '@/components/mira-soul-scope';
import { useMiraSoul, useUpdateMiraSoul } from './use-mira-soul';

const auth = vi.hoisted(() => ({
  listeners: new Set<
    (event: string, session: { user: { id: string } } | null) => void
  >(),
}));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (
        callback: (
          event: string,
          session: { user: { id: string } } | null
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
const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
  auth.listeners.clear();
  vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function receipt(name: string, actor = 'actor-a') {
  return new Response(JSON.stringify({ soul: { user_id: actor, name } }), {
    status: 200,
  });
}
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(value);
  return value;
}
function Read() {
  const read = useMiraSoul();
  return <span>{read.data?.name ?? 'missing'}</span>;
}

it('fences late actor A GET through committed A→B→A and preserves the new A receipt', async () => {
  const cache = client();
  const held = deferred<Response>();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(held.promise)
    .mockResolvedValueOnce(receipt('B name', 'actor-b'))
    .mockResolvedValueOnce(receipt('New A name'));
  vi.stubGlobal('fetch', fetch);
  const node = (actor: string) => (
    <QueryClientProvider client={cache}>
      <MiraSoulScopeProvider key={actor} actorId={actor}>
        <Read />
      </MiraSoulScopeProvider>
    </QueryClientProvider>
  );
  const view = render(node('actor-a'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const initialSignal = (fetch.mock.calls[0]?.[1] as RequestInit | undefined)
    ?.signal;
  view.rerender(node('actor-b'));
  await screen.findByText('B name');
  view.rerender(node('actor-a'));
  await screen.findByText('New A name');
  await act(async () => held.resolve(receipt('Old A name')));
  expect(initialSignal?.aborted).toBe(true);
  expect(screen.getByText('New A name')).toBeInTheDocument();
  expect(
    cache.getQueryData(['mira-soul', 'detail', 'actor-b'])
  ).toBeUndefined();
});

it.each(['SIGNED_OUT', 'USER_UPDATED'])(
  'revokes held rename on %s departure without admitting a later same-ID auth event',
  async (event) => {
    const cache = client();
    const held = deferred<Response>();
    const success = vi.fn();
    const failure = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => held.promise)
    );
    cache.setQueryData(['mira-soul', 'detail', 'actor-a'], {
      soul: { name: 'Initial' },
    });
    let rename!: ReturnType<typeof useUpdateMiraSoul>;
    function Write() {
      rename = useUpdateMiraSoul();
      return null;
    }
    render(
      <QueryClientProvider client={cache}>
        <MiraSoulScopeProvider actorId="actor-a">
          <Write />
        </MiraSoulScopeProvider>
      </QueryClientProvider>
    );
    let result!: Promise<unknown>;
    act(() => {
      result = rename
        .mutateAsync({ name: 'New' }, { onSuccess: success, onError: failure })
        .catch((error) => error);
    });
    await waitFor(() =>
      expect(cache.getQueryData(['mira-soul', 'detail', 'actor-a'])).toEqual({
        soul: { name: 'New' },
      })
    );
    act(() => {
      auth.listeners.forEach((callback) => {
        callback(
          event,
          event === 'SIGNED_OUT' ? null : { user: { id: 'actor-b' } }
        );
      });
      auth.listeners.forEach((callback) => {
        callback('SIGNED_IN', { user: { id: 'actor-a' } });
      });
    });
    await act(async () => held.resolve(receipt('New')));
    expect(await result).toBeInstanceOf(Error);
    expect(
      cache.getQueryData(['mira-soul', 'detail', 'actor-a'])
    ).toBeUndefined();
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  }
);

it('an abandoned actor render does not revoke the committed actor or its pending rename', async () => {
  const cache = client();
  const held = deferred<Response>();
  const forever = new Promise<void>(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => held.promise)
  );
  cache.setQueryData(['mira-soul', 'detail', 'actor-a'], {
    soul: { name: 'Initial' },
  });
  let rename!: ReturnType<typeof useUpdateMiraSoul>;
  let switchActor!: (value: string) => void;
  function Write({ actor }: { actor: string }) {
    const value = useUpdateMiraSoul();
    if (actor === 'actor-b') throw forever;
    rename = value;
    return <span>{actor}</span>;
  }
  function App() {
    const [actor, setActor] = useState('actor-a');
    switchActor = setActor;
    return (
      <QueryClientProvider client={cache}>
        <Suspense fallback="pending">
          <MiraSoulScopeProvider key={actor} actorId={actor}>
            <Write actor={actor} />
          </MiraSoulScopeProvider>
        </Suspense>
      </QueryClientProvider>
    );
  }
  render(<App />);
  let result!: Promise<unknown>;
  act(() => {
    result = rename.mutateAsync({ name: 'Confirmed' });
  });
  await waitFor(() =>
    expect(cache.getQueryData(['mira-soul', 'detail', 'actor-a'])).toEqual({
      soul: { name: 'Confirmed' },
    })
  );
  act(() => startTransition(() => switchActor('actor-b')));
  expect(screen.getByText('actor-a')).toBeInTheDocument();
  await act(async () => {
    held.resolve(receipt('Authoritative'));
    await result;
  });
  expect(cache.getQueryData(['mira-soul', 'detail', 'actor-a'])).toEqual({
    soul: { user_id: 'actor-a', name: 'Authoritative' },
  });
  act(() => switchActor('actor-a'));
});

it('does not issue a Soul request without a verified actor', async () => {
  const cache = client();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={cache}>
      <MiraSoulScopeProvider actorId={null}>
        <Read />
      </MiraSoulScopeProvider>
    </QueryClientProvider>
  );
  expect(screen.getByText('missing')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('admits fresh verified same-owner session while the previous session receipt stays fenced', async () => {
  const cache = client();
  const held = deferred<Response>();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(held.promise)
    .mockResolvedValueOnce(receipt('Fresh verified session'));
  vi.stubGlobal('fetch', fetch);
  const node = (revision: string) => (
    <QueryClientProvider client={cache}>
      <MiraSoulScopeProvider actorId="actor-a" sessionRevision={revision}>
        <Read />
      </MiraSoulScopeProvider>
    </QueryClientProvider>
  );
  const view = render(node('session-one'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  act(() =>
    auth.listeners.forEach((callback) => {
      callback('SIGNED_OUT', null);
    })
  );
  view.rerender(node('session-two'));
  await screen.findByText('Fresh verified session');
  await act(async () => held.resolve(receipt('Old session receipt')));
  expect(screen.getByText('Fresh verified session')).toBeInTheDocument();
});
