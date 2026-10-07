import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '../../../../../hooks/use-workspace-visibility';
import { useInvoiceCustomerSearch } from './use-invoice-customer-search';

function user(label: string, id = 'selected') {
  return { id, display_name: label, full_name: label };
}
function reply(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
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
let owner = 'account-A';
let currentQuery: ReturnType<typeof useInvoiceCustomerSearch>;
let currentActor: ReturnType<typeof useWorkspaceActor>;
function Probe({
  ws,
  search,
  selected,
}: {
  ws: string;
  search: string;
  selected: string;
}) {
  currentActor = useWorkspaceActor();
  currentQuery = useInvoiceCustomerSearch(ws, search, selected);
  return (
    <>
      <output aria-label="Synthetic customers">
        {currentQuery.customers.map((item) => item.display_name).join(',')}
      </output>
      <output aria-label="Synthetic selected">
        {currentQuery.selectedUser?.display_name ?? 'none'}
      </output>
      <output aria-label="Synthetic error">
        {currentQuery.error ? 'failed' : 'none'}
      </output>
      <output aria-label="Synthetic loading">
        {String(currentQuery.isLoading)}
      </output>
    </>
  );
}
function mount(selected = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (actor: string, ws: string, search: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actor}>
        <Probe ws={ws} search={search} selected={selected} />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const result = render(content('account-A', 'ws-1', ''));
  return {
    ...result,
    client,
    redraw: (actor = 'account-A', ws = 'ws-1', search = '') => {
      owner = actor;
      result.rerender(content(actor, ws, search));
    },
  };
}
function url(input: string) {
  return new URL(input, window.location.origin);
}
function listCalls() {
  return transport.mock.calls.filter(([input]) =>
    url(input).pathname.endsWith('/users')
  );
}
function detailCalls() {
  return transport.mock.calls.filter(([input]) =>
    url(input).pathname.endsWith('/users/selected')
  );
}
async function customers(label: string) {
  await waitFor(() =>
    expect(screen.getByLabelText('Synthetic customers')).toHaveTextContent(
      label
    )
  );
}
async function selected(label: string) {
  await waitFor(() =>
    expect(screen.getByLabelText('Synthetic selected')).toHaveTextContent(label)
  );
}
beforeEach(() => {
  owner = 'account-A';
  transport.mockReset();
  transport.mockImplementation((input: string) => {
    const path = url(input).pathname;
    if (path.endsWith('/users'))
      return Promise.resolve(reply({ data: [user(owner)], count: 1 }));
    if (path.endsWith('/users/selected'))
      return Promise.resolve(reply(user(owner)));
    throw new Error('Unexpected synthetic API route');
  });
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('actual customer search account and workspace handoff', () => {
  it('reauthorizes fresh list rows for the replacement account', async () => {
    const view = mount();
    await customers('account-A');
    const expired = currentActor;
    view.redraw('account-B');
    expect(() => expired?.assertActive()).toThrow('Workspace account changed');
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await customers('account-B');
    expect(screen.getByLabelText('Synthetic customers')).not.toHaveTextContent(
      'account-A'
    );
  });
  it('reauthorizes cached selected detail even when the list stays empty', async () => {
    transport.mockImplementation((input: string) =>
      Promise.resolve(
        url(input).pathname.endsWith('/users')
          ? reply({ data: [], count: 0 })
          : reply(user(owner))
      )
    );
    const view = mount('selected');
    await selected('account-A');
    view.redraw('account-B');
    await waitFor(() => expect(detailCalls()).toHaveLength(2));
    await selected('account-B');
    expect(screen.getByLabelText('Synthetic selected')).not.toHaveTextContent(
      'account-A'
    );
  });
  it('does not use old workspace placeholder rows as current selected-customer authority', async () => {
    const pending = held();
    const view = mount('selected');
    await selected('account-A');
    transport.mockImplementation((input: string) => {
      const parsed = url(input);
      if (parsed.pathname === '/api/v1/workspaces/ws-2/users')
        return pending.promise;
      if (parsed.pathname === '/api/v1/workspaces/ws-2/users/selected')
        return Promise.resolve(reply([]));
      throw new Error('Unexpected synthetic new-workspace route');
    });
    view.redraw('account-A', 'ws-2');
    expect(screen.getByLabelText('Synthetic customers')).not.toHaveTextContent(
      'account-A'
    );
    expect(screen.getByLabelText('Synthetic selected')).toHaveTextContent(
      'none'
    );
    await waitFor(() =>
      expect(
        detailCalls().some(([input]) => url(input).pathname.includes('/ws-2/'))
      ).toBe(true)
    );
    await act(async () => {
      pending.resolve(reply({ data: [], count: 0 }));
      await pending.promise;
    });
    expect(screen.getByLabelText('Synthetic selected')).toHaveTextContent(
      'none'
    );
  });
  for (const kind of ['list', 'detail'] as const) {
    for (const boundary of ['replacement', 'ABA'] as const) {
      it(`held old ${kind} cannot supply current customer after actor ${boundary}`, async () => {
        const pending = held();
        let admittedOld = false;
        transport.mockImplementation((input: string) => {
          const isList = url(input).pathname.endsWith('/users');
          if ((kind === 'list' && isList) || (kind === 'detail' && !isList)) {
            if (!admittedOld) {
              admittedOld = true;
              return pending.promise;
            }
            return Promise.resolve(
              reply(
                isList
                  ? { data: [user('new-lifetime')], count: 1 }
                  : user('new-lifetime')
              )
            );
          }
          return Promise.resolve(reply({ data: [], count: 0 }));
        });
        const view = mount(kind === 'detail' ? 'selected' : '');
        await waitFor(() => expect(admittedOld).toBe(true));
        const expired = currentActor;
        view.redraw('account-B');
        if (boundary === 'ABA') {
          await act(async () => {
            await Promise.resolve();
          });
          view.redraw('account-A');
        }
        expect(() => expired?.assertActive()).toThrow(
          'Workspace account changed'
        );
        await act(async () => {
          pending.resolve(
            reply(
              kind === 'list'
                ? { data: [user('expired-lifetime')], count: 1 }
                : user('expired-lifetime')
            )
          );
          await pending.promise;
        });
        if (kind === 'list') await customers('new-lifetime');
        else await selected('new-lifetime');
        expect(
          screen.getByLabelText('Synthetic customers')
        ).not.toHaveTextContent('expired-lifetime');
        expect(
          screen.getByLabelText('Synthetic selected')
        ).not.toHaveTextContent('expired-lifetime');
      });
    }
  }
  it('reuses fresh rows within the same account and workspace', async () => {
    const view = mount();
    await customers('account-A');
    view.redraw();
    await customers('account-A');
    expect(listCalls()).toHaveLength(1);
  });
  it('retains same-workspace search placeholders until the next search settles', async () => {
    const pending = held();
    const view = mount();
    await customers('account-A');
    transport.mockReturnValueOnce(pending.promise);
    view.redraw('account-A', 'ws-1', ' next ');
    expect(screen.getByLabelText('Synthetic customers')).toHaveTextContent(
      'account-A'
    );
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(url(listCalls()[1]?.[0]).searchParams.get('q')).toBe('next');
    await act(async () => {
      pending.resolve(reply({ data: [user('next-search')], count: 1 }));
      await pending.promise;
    });
    await customers('next-search');
  });
  it('retains normalized inclusive paging and selected fallback error recovery', async () => {
    transport.mockImplementation((input: string) => {
      if (url(input).pathname.endsWith('/users'))
        return Promise.resolve(reply({ data: [], count: 0 }));
      return Promise.reject(new Error('Synthetic selected failure'));
    });
    mount('selected');
    await waitFor(() =>
      expect(screen.getByLabelText('Synthetic error')).toHaveTextContent(
        'failed'
      )
    );
    const parsed = url(listCalls()[0]?.[0]);
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
      from: '0',
      to: '24',
      limit: '25',
    });
    expect(currentQuery.hasNextPage).toBe(false);
    transport.mockImplementation((input: string) =>
      Promise.resolve(
        url(input).pathname.endsWith('/users')
          ? reply({ data: [], count: 0 })
          : reply(user('recovered'))
      )
    );
    await act(async () => {
      await currentQuery.refetch();
    });
    await selected('recovered');
    expect(screen.getByLabelText('Synthetic error')).toHaveTextContent('none');
  });
  for (const kind of ['list', 'detail'] as const) {
    it(`an expired ${kind} transport error cannot affect the new account lifetime`, async () => {
      const pending = held();
      let oldAdmitted = false;
      transport.mockImplementation((input: string) => {
        const isList = url(input).pathname.endsWith('/users');
        if ((kind === 'list' && isList) || (kind === 'detail' && !isList)) {
          if (!oldAdmitted) {
            oldAdmitted = true;
            return pending.promise;
          }
          return Promise.resolve(
            reply(
              isList
                ? { data: [user('current-lifetime')], count: 1 }
                : user('current-lifetime')
            )
          );
        }
        return Promise.resolve(reply({ data: [], count: 0 }));
      });
      const view = mount(kind === 'detail' ? 'selected' : '');
      await waitFor(() => expect(oldAdmitted).toBe(true));
      view.redraw('account-B');
      if (kind === 'list') await customers('current-lifetime');
      else await selected('current-lifetime');
      view.redraw('account-A');
      if (kind === 'list') await customers('current-lifetime');
      else await selected('current-lifetime');
      await act(async () => {
        pending.reject(new Error('Synthetic expired transport failure'));
        await pending.promise.catch(() => {});
      });
      expect(screen.getByLabelText('Synthetic error')).toHaveTextContent(
        'none'
      );
      expect(currentQuery.error).toBeNull();
      await waitFor(() =>
        expect(
          view.client
            .getQueryCache()
            .getAll()
            .find((entry) => entry.state.error)?.state.error
        ).toEqual(new Error('Workspace account changed'))
      );
    });
  }
  it('does not admit automatic, manual or page reads without a verified actor', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Probe ws="ws-1" search="" selected="selected" />
      </QueryClientProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(transport).not.toHaveBeenCalled();
    let manual!: Awaited<ReturnType<typeof currentQuery.refetch>>;
    let page!: Awaited<ReturnType<typeof currentQuery.fetchNextPage>>;
    await act(async () => {
      manual = await currentQuery.refetch();
      page = await currentQuery.fetchNextPage();
    });
    expect(manual[0]?.error).toEqual(
      new Error('Workspace account unavailable')
    );
    expect(page.error).toEqual(new Error('Workspace account unavailable'));
    expect(transport).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Synthetic selected')).toHaveTextContent(
      'none'
    );
  });
  it('rejects a retained old account page callback before transport dispatch', async () => {
    transport.mockImplementation(() =>
      Promise.resolve(reply({ data: [user(owner)], count: 2 }))
    );
    const view = mount();
    await customers('account-A');
    const previous = currentQuery;
    expect(previous.hasNextPage).toBe(true);
    view.redraw('account-B');
    await customers('account-B');
    const admitted = transport.mock.calls.length;
    let result!: Awaited<ReturnType<typeof previous.fetchNextPage>>;
    await act(async () => {
      result = await previous.fetchNextPage();
    });
    expect(result.error).toEqual(new Error('Workspace account changed'));
    expect(transport).toHaveBeenCalledTimes(admitted);
    await customers('account-B');
  });
  it('preserves current list transport error and explicit recovery', async () => {
    const failure = new Error('Synthetic current list failure');
    transport.mockRejectedValueOnce(failure);
    mount();
    await waitFor(() =>
      expect(screen.getByLabelText('Synthetic error')).toHaveTextContent(
        'failed'
      )
    );
    expect(currentQuery.error).toBe(failure);
    expect(transport).toHaveBeenCalledOnce();
    await act(async () => {
      await currentQuery.refetch();
    });
    await customers('account-A');
    expect(screen.getByLabelText('Synthetic error')).toHaveTextContent('none');
  });
});
