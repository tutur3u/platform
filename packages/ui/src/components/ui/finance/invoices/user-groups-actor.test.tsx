import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '../../../../hooks/use-workspace-visibility';
import { useSubscriptionInvoiceContext, useUserGroups } from './hooks';
import { invalidateInvoiceMutationQueries } from './query-invalidation';
import type { UserGroup } from './utils';

function context(owner: string): UserGroup[] {
  return [
    {
      workspace_user_groups: {
        archived: false,
        cert_template: 'original',
        created_at: null,
        creator_id: null,
        description: null,
        is_course_published: false,
        is_guest: false,
        notes: null,
        ws_id: 'ws-1',
        id: 'group-1',
        name: owner,
        starting_date: null,
        ending_date: null,
        sessions: ['2026-09-01'],
      },
    },
  ];
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
let observedQuery: ReturnType<typeof useUserGroups>;
let actorLease: ReturnType<typeof useWorkspaceActor>;
function Probe({ wsId, customerId }: { wsId: string; customerId: string }) {
  actorLease = useWorkspaceActor();
  const query = useUserGroups(wsId, customerId);
  observedQuery = query;
  return (
    <output aria-label="Synthetic context owner">
      {query.data?.[0]?.workspace_user_groups?.name ?? 'pending'}
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

describe('actual user groups transport and shared cache actor lifetime', () => {
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
      '/api/v1/workspaces/ws-1/users/customer-1/user-groups'
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
            entry.queryKey[0] === 'user-groups' && entry.getObserversCount() > 0
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
      const url = new URL(transport.mock.calls[1]?.[0], window.location.origin);
      expect(url.pathname).toContain(
        boundary === 'workspace' ? '/workspaces/ws-2/' : '/workspaces/ws-1/'
      );
      expect(url.pathname).toContain(
        `/users/${boundary === 'customer' ? 'customer-2' : 'customer-1'}/user-groups`
      );
    });
  }
  for (const outcome of ['success', 'error'] as const) {
    it(`rejects held old actor ${outcome} after account ABA`, async () => {
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
      await waitFor(() =>
        expect(
          view.client
            .getQueryCache()
            .getAll()
            .find((entry) => entry.state.error)?.state.error
        ).toEqual(new Error('Workspace account changed'))
      );
      expect(
        view.client
          .getQueryCache()
          .getAll()
          .filter((entry) => entry.getObserversCount() > 0)
          .map((entry) => entry.state.data)
      ).toEqual([context('new-lifetime')]);
    });
  }
  it('requires a verified actor for automatic and manual reads', async () => {
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
    let manualResult!: Awaited<ReturnType<typeof observedQuery.refetch>>;
    await act(async () => {
      manualResult = await observedQuery.refetch();
    });
    expect(manualResult.error).toEqual(
      new Error('Workspace account unavailable')
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('preserves current actor transport error and explicit retry', async () => {
    transport.mockRejectedValueOnce(
      new Error('Synthetic current transport failure')
    );
    mount();
    await waitFor(() =>
      expect(observedQuery.error).toEqual(
        new Error('Synthetic current transport failure')
      )
    );
    expect(transport).toHaveBeenCalledOnce();
    transport.mockImplementation(() => Promise.resolve(reply('recovered')));
    await act(async () => {
      await observedQuery.refetch();
    });
    await displayed('recovered');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('retains workspace-prefix refetch and existing invoice invalidation exclusions', async () => {
    const view = mount();
    await displayed('account-A');
    transport.mockImplementation(() => Promise.resolve(reply('refreshed')));
    await act(async () => {
      await invalidateInvoiceMutationQueries(view.client, 'ws-1');
    });
    expect(transport).toHaveBeenCalledOnce();
    await act(async () => {
      await view.client.invalidateQueries({
        queryKey: ['user-groups', 'ws-1'],
      });
    });
    await displayed('refreshed');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('shares the same permanent actor token with the actual context hook', async () => {
    function Both() {
      useUserGroups('ws-1', 'customer-1');
      useSubscriptionInvoiceContext(
        'ws-1',
        'customer-1',
        ['group-1'],
        '2026-09'
      );
      return null;
    }
    transport.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/finance/invoices/')
          ? new Response(
              JSON.stringify({
                attendance: [],
                latestInvoices: [],
                scheduledSessionsByGroupId: {},
              }),
              { status: 200 }
            )
          : reply('shared')
      )
    );
    const client = new QueryClient();
    const content = (actor: string) => (
      <QueryClientProvider client={client}>
        <WorkspaceVisibilityProvider actorId={actor}>
          <Both />
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );
    const view = render(content('account-A'));
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .getAll()
          .filter((entry) => entry.state.status === 'success')
      ).toHaveLength(2)
    );
    const keys = client
      .getQueryCache()
      .getAll()
      .map((entry) => entry.queryKey);
    const original = keys.find((key) => key[0] === 'user-groups')?.[4];
    expect(original).toEqual(
      keys.find((key) => key[0] === 'subscription-invoice-context')?.[7]
    );
    view.rerender(content('account-B'));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(4));
    const active = client
      .getQueryCache()
      .getAll()
      .filter((entry) => entry.getObserversCount() > 0)
      .map((entry) => entry.queryKey);
    expect(active.find((key) => key[0] === 'user-groups')?.[4]).toEqual(
      active.find((key) => key[0] === 'subscription-invoice-context')?.[7]
    );
    expect(active.find((key) => key[0] === 'user-groups')?.[4]).not.toEqual(
      original
    );
  });
});
