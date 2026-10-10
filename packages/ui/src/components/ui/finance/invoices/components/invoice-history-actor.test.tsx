import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '../../../../../hooks/use-workspace-visibility';
import { FinanceRouteProvider } from '../../finance-route-context';
import { useInfiniteUserInvoices } from '../hooks';
import { invalidateInvoiceMutationQueries } from '../query-invalidation';
import { InvoiceUserHistoryAccordion } from './invoice-user-history-accordion';

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}));
const transport = vi.fn();
let owner = 'account-A';
let history: ReturnType<typeof useInfiniteUserInvoices>;
function Probe({ ws, customer }: { ws: string; customer: string }) {
  history = useInfiniteUserInvoices(ws, customer);
  return <span data-testid="history-error">{history.error?.message}</span>;
}
let actorLease: ReturnType<typeof useWorkspaceActor>;
function Witness() {
  actorLease = useWorkspaceActor();
  return null;
}
function invoice(label: string, id = 'synthetic-invoice') {
  return {
    id,
    notice: label,
    price: 100,
    total_diff: 0,
    created_at: '2026-09-01T12:00:00.000Z',
    note: null,
  };
}
function reply(label: string, count = 1, id?: string) {
  return new Response(JSON.stringify({ data: [invoice(label, id)], count }), {
    status: 200,
  });
}
function held() {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function parsed(input: string) {
  return new URL(input, window.location.origin);
}
function mount(initialActor: string | null = 'account-A') {
  // Same persistent QueryClient as the satellite provider across actor remounts.
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 300_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  const content = (actor: string | null, ws: string, customer: string) => {
    const body = (
      <>
        <Witness />
        <Probe ws={ws} customer={customer} />
        <FinanceRouteProvider prefix="">
          <InvoiceUserHistoryAccordion wsId={ws} userId={customer} />
        </FinanceRouteProvider>
      </>
    );
    return (
      <QueryClientProvider client={client}>
        {actor ? (
          <WorkspaceVisibilityProvider actorId={actor}>
            {body}
          </WorkspaceVisibilityProvider>
        ) : (
          body
        )}
      </QueryClientProvider>
    );
  };
  const result = render(content(initialActor, 'ws-1', 'customer-1'));
  return {
    ...result,
    client,
    redraw: (
      actor: string | null = 'account-A',
      ws = 'ws-1',
      customer = 'customer-1'
    ) => {
      owner = actor ?? 'missing-account';
      result.rerender(content(actor, ws, customer));
    },
  };
}
async function openHistory(label: string) {
  const trigger = await screen.findByRole('button', {
    name: /ws-invoices.plural/,
  });
  if (trigger.getAttribute('aria-expanded') !== 'true')
    fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByText(label)).toBeVisible());
}
beforeEach(() => {
  owner = 'account-A';
  transport.mockReset();
  transport.mockImplementation((input: string) => {
    if (!parsed(input).pathname.endsWith('/finance/invoices'))
      throw new Error('Unexpected synthetic history route');
    return Promise.resolve(reply(owner));
  });
  vi.stubGlobal('fetch', transport);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('actual mounted invoice history cache account lifetime', () => {
  it('reauthorizes the replacement actor before showing cached invoice history', async () => {
    const view = mount();
    await openHistory('account-A');
    const expired = actorLease;
    view.redraw('account-B');
    expect(() => expired?.assertActive()).toThrow('Workspace account changed');
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    await openHistory('account-B');
    expect(screen.queryByText('account-A')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/ws-1/invoices/synthetic-invoice'
    );
  });
  for (const boundary of ['replacement', 'ABA'] as const) {
    it(`does not show an old held response after actor ${boundary}`, async () => {
      const old = held();
      transport
        .mockReturnValueOnce(old.promise)
        .mockImplementation(() => Promise.resolve(reply('new-lifetime')));
      const view = mount();
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      const expired = actorLease;
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
        old.resolve(reply('expired-lifetime'));
        await old.promise;
      });
      await openHistory('new-lifetime');
      expect(screen.queryByText('expired-lifetime')).not.toBeInTheDocument();
      const active = view.client
        .getQueryCache()
        .getAll()
        .filter((entry) => entry.getObserversCount() > 0);
      expect(active).toHaveLength(1);
    });
  }
  it('reuses fresh history within the same actor lifetime', async () => {
    const view = mount();
    await openHistory('account-A');
    view.redraw();
    await openHistory('account-A');
    expect(transport).toHaveBeenCalledOnce();
  });
  for (const scope of ['workspace', 'customer'] as const) {
    it(`keeps same-actor ${scope} history isolated`, async () => {
      const view = mount();
      await openHistory('account-A');
      transport.mockImplementation(() =>
        Promise.resolve(reply('other-history'))
      );
      view.redraw(
        'account-A',
        scope === 'workspace' ? 'ws-2' : 'ws-1',
        scope === 'customer' ? 'customer-2' : 'customer-1'
      );
      await openHistory('other-history');
      expect(transport).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('account-A')).not.toBeInTheDocument();
      const request = parsed(transport.mock.calls[1]?.[0]);
      expect(request.pathname).toContain(
        scope === 'workspace' ? '/ws-2/' : '/ws-1/'
      );
      expect(request.searchParams.getAll('customerIds')).toEqual([
        scope === 'customer' ? 'customer-2' : 'customer-1',
      ]);
    });
  }
  it('uses the actual load-more control with preserved page/count admission', async () => {
    transport.mockImplementation((input: string) =>
      Promise.resolve(
        parsed(input).searchParams.get('page') === '2'
          ? reply('second-page', 11, 'synthetic-second')
          : reply('first-page', 11)
      )
    );
    mount();
    await openHistory('first-page');
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-invoices.load_more' })
    );
    await waitFor(() => expect(screen.getByText('second-page')).toBeVisible());
    expect(screen.getByText('first-page')).toBeVisible();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      Object.fromEntries(parsed(transport.mock.calls[1]?.[0]).searchParams)
    ).toMatchObject({ page: '2', pageSize: '10', customerIds: 'customer-1' });
    expect(
      screen.queryByRole('button', { name: 'ws-invoices.load_more' })
    ).not.toBeInTheDocument();
  });
  for (const boundary of ['replacement', 'ABA'] as const) {
    it(`rejects a held old error after actor ${boundary} without replacing current history`, async () => {
      const old = held();
      transport
        .mockReturnValueOnce(old.promise)
        .mockImplementation(() => Promise.resolve(reply('current-history')));
      const view = mount();
      await waitFor(() => expect(transport).toHaveBeenCalledOnce());
      const oldKey = view.client.getQueryCache().getAll()[0]?.queryKey ?? [];
      view.redraw('account-B');
      if (boundary === 'ABA') {
        await act(async () => {
          await Promise.resolve();
        });
        view.redraw('account-A');
      }
      await act(async () => {
        old.reject(new Error('Synthetic transport failure'));
      });
      await openHistory('current-history');
      expect(screen.getByTestId('history-error')).toBeEmptyDOMElement();
      expect(view.client.getQueryState(oldKey)?.error).toMatchObject({
        message: 'Workspace account changed',
      });
    });
  }
  it('denies missing-actor automatic, manual and page admission without transport', async () => {
    mount(null);
    expect(transport).not.toHaveBeenCalled();
    await act(async () => {
      const result = await history.refetch();
      expect(result.error?.message).toBe('Workspace account unavailable');
      const page = await history.fetchNextPage();
      expect(page.error?.message).toBe('Workspace account unavailable');
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it('denies a retained prior-actor page callback and keeps current pagination usable', async () => {
    transport.mockImplementation((input: string) =>
      Promise.resolve(
        reply(`${owner}-${parsed(input).searchParams.get('page')}`, 11)
      )
    );
    const view = mount();
    await openHistory('account-A-1');
    const oldPage = history.fetchNextPage;
    view.redraw('account-B');
    await openHistory('account-B-1');
    const before = transport.mock.calls.length;
    await act(async () => {
      const result = await oldPage();
      expect(result.error?.message).toBe('Workspace account changed');
    });
    expect(transport).toHaveBeenCalledTimes(before);
    await act(async () => {
      await history.fetchNextPage();
    });
    await waitFor(() => expect(screen.getByText('account-B-2')).toBeVisible());
  });
  it('retains workspace mutation invalidation and refetches active actor history', async () => {
    const view = mount();
    await openHistory('account-A');
    transport.mockImplementation(() =>
      Promise.resolve(reply('refreshed-history'))
    );
    await act(async () => {
      await invalidateInvoiceMutationQueries(view.client, 'ws-2');
    });
    expect(transport).toHaveBeenCalledOnce();
    await act(async () => {
      await invalidateInvoiceMutationQueries(view.client, 'ws-1');
    });
    await openHistory('refreshed-history');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('keeps a current transport error truthful and permits explicit retry', async () => {
    transport.mockRejectedValueOnce(new Error('Synthetic current failure'));
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('history-error')).toHaveTextContent(
        'Synthetic current failure'
      )
    );
    expect(transport).toHaveBeenCalledOnce();
    await act(async () => {
      await history.refetch();
    });
    await openHistory('account-A');
    expect(screen.getByTestId('history-error')).toBeEmptyDOMElement();
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
