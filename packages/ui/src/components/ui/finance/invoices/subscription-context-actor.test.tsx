import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { SubscriptionInvoiceContextResponse } from '@tuturuuu/internal-api/finance';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '../../../../hooks/use-workspace-visibility';
import { useSubscriptionInvoiceContext } from './hooks';
import { invalidateInvoiceMutationQueries } from './query-invalidation';

function context(owner: string): SubscriptionInvoiceContextResponse {
  return {
    attendance: [{ date: '2026-09-01', status: owner }],
    latestInvoices: [],
    scheduledSessionsByGroupId: { 'group-1': ['2026-09-01'] },
  };
}
function reply(owner: string) {
  return new Response(JSON.stringify(context(owner)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
function held() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const transport = vi.fn();
let actorLease: ReturnType<typeof useWorkspaceActor>;
function Probe({ wsId, customerId }: { wsId: string; customerId: string }) {
  actorLease = useWorkspaceActor();
  const query = useSubscriptionInvoiceContext(
    wsId,
    customerId,
    ['group-1'],
    '2026-09'
  );
  return (
    <output aria-label="Synthetic context owner">
      {query.data?.attendance[0]?.status ?? 'pending'}
    </output>
  );
}
function mount() {
  // Matches satellite ClientProviders: the QueryClient survives actor remounts.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (actor: string, wsId: string, customerId: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actor}>
        <Probe wsId={wsId} customerId={customerId} />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const result = render(view('account-A', 'ws-1', 'customer-1'));
  return {
    ...result,
    client,
    redraw: (actor = 'account-A', ws = 'ws-1', customer = 'customer-1') =>
      result.rerender(view(actor, ws, customer)),
  };
}
async function displayed(owner: string) {
  await waitFor(() =>
    expect(screen.getByLabelText('Synthetic context owner')).toHaveTextContent(
      owner
    )
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  transport.mockReset();
  transport.mockImplementation(() => Promise.resolve(reply('account-A')));
  vi.stubGlobal('fetch', transport);
});

describe('actual subscription context transport and shared cache actor lifetime', () => {
  it('reauthorizes a fresh account-A context after changing to account-B at identical coordinates', async () => {
    const view = mount();
    await displayed('account-A');
    const expired = actorLease;
    transport.mockImplementation(() => Promise.resolve(reply('account-B')));
    view.redraw('account-B');
    expect(() => expired?.assertActive()).toThrow('Workspace account changed');
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    await displayed('account-B');
    expect(transport.mock.calls[0]?.[0]).toContain(
      '/api/v1/workspaces/ws-1/finance/invoices/subscription/context'
    );
    expect(transport.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
  });
  it('does not deliver an old account-A held transport into the account-B observer or cache', async () => {
    const old = held();
    transport
      .mockReturnValueOnce(old.promise)
      .mockImplementation(() => Promise.resolve(reply('account-B')));
    const view = mount();
    await waitFor(() => expect(transport).toHaveBeenCalledOnce());
    const expired = actorLease;
    view.redraw('account-B');
    expect(() => expired?.assertActive()).toThrow('Workspace account changed');
    await act(async () => {
      old.resolve(reply('account-A'));
      await old.promise;
    });
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    await displayed('account-B');
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .filter(
          (entry) =>
            entry.queryKey[0] === 'subscription-invoice-context' &&
            entry.getObserversCount() > 0
        )
        .map((entry) => entry.state.data)
    ).toEqual([context('account-B')]);
  });
  it('reuses fresh context inside the same actor lifetime', async () => {
    const view = mount();
    await displayed('account-A');
    view.redraw();
    await displayed('account-A');
    expect(transport).toHaveBeenCalledOnce();
  });
  for (const boundary of ['workspace', 'customer'] as const) {
    it(`keeps same-actor ${boundary} contexts distinct`, async () => {
      const view = mount();
      await displayed('account-A');
      transport.mockImplementation(() =>
        Promise.resolve(reply('other-context'))
      );
      view.redraw(
        'account-A',
        boundary === 'workspace' ? 'ws-2' : 'ws-1',
        boundary === 'customer' ? 'customer-2' : 'customer-1'
      );
      await displayed('other-context');
      expect(transport).toHaveBeenCalledTimes(2);
      const url = new URL(transport.mock.calls[1]?.[0]);
      expect(url.pathname).toContain(
        boundary === 'workspace' ? '/workspaces/ws-2/' : '/workspaces/ws-1/'
      );
      expect(url.searchParams.get('userId')).toBe(
        boundary === 'customer' ? 'customer-2' : 'customer-1'
      );
    });
  }
  for (const outcome of ['success', 'error'] as const) {
    it(`isolates held old account-A ${outcome} after actor ABA`, async () => {
      const old = held();
      transport
        .mockReturnValueOnce(old.promise)
        .mockImplementation(() => Promise.resolve(reply('new-lifetime')));
      const view = mount();
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      const expired = actorLease;
      view.redraw('account-B');
      await displayed('new-lifetime');
      view.redraw('account-A');
      await displayed('new-lifetime');
      expect(transport).toHaveBeenCalledTimes(3);
      expect(() => expired?.assertActive()).toThrow(
        'Workspace account changed'
      );
      await act(async () => {
        if (outcome === 'success') old.resolve(reply('expired-lifetime'));
        else old.reject(new Error('Synthetic expired transport failure'));
        await old.promise.catch(() => {});
      });
      await displayed('new-lifetime');
      const entries = view.client.getQueryCache().getAll();
      await waitFor(() =>
        expect(
          entries.find(
            (entry) => entry.getObserversCount() === 0 && entry.state.error
          )?.state.error
        ).toEqual(new Error('Workspace account changed'))
      );
      expect(
        entries
          .filter((entry) => entry.getObserversCount() > 0)
          .map((entry) => entry.state.data)
      ).toEqual([context('new-lifetime')]);
      expect(
        entries
          .filter(
            (entry) =>
              entry.queryKey[0] === 'subscription-invoice-context' &&
              entry.queryKey[6] === 'account-A'
          )
          .map((entry) => entry.queryKey[7])
      ).toHaveLength(2);
    });
  }
  it('does not admit context requests without a verified actor provider', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Probe wsId="ws-1" customerId="customer-1" />
      </QueryClientProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(transport).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Synthetic context owner')).toHaveTextContent(
      'pending'
    );
  });
  it('workspace invalidation still refetches the actor-scoped context', async () => {
    const view = mount();
    await displayed('account-A');
    transport.mockImplementation(() =>
      Promise.resolve(reply('refreshed-context'))
    );
    await act(async () => {
      await invalidateInvoiceMutationQueries(view.client, 'other-workspace');
    });
    expect(transport).toHaveBeenCalledOnce();
    await act(async () => {
      await invalidateInvoiceMutationQueries(view.client, 'ws-1');
    });
    await displayed('refreshed-context');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      view.client.getQueryCache().getAll()[0]?.queryKey.slice(0, 2)
    ).toEqual(['subscription-invoice-context', 'ws-1']);
  });
});
