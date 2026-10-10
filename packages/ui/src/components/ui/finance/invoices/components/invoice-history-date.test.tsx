import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../apps/contacts/messages/en.json';
import viMessages from '../../../../../../../../apps/contacts/messages/vi.json';
import { WorkspaceVisibilityProvider } from '../../../../../hooks/use-workspace-visibility';
import { FinanceRouteProvider } from '../../finance-route-context';
import { InvoiceUserHistoryAccordion } from './invoice-user-history-accordion';

const transport = vi.fn();
let caught: string[] = [];
class HistoryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    caught.push(error.name);
  }
  render() {
    return this.state.failed ? (
      <p>Synthetic history boundary</p>
    ) : (
      this.props.children
    );
  }
}
function mount(locale: 'en' | 'vi', date: string | null | undefined) {
  transport.mockImplementation((input: string) => {
    if (
      !new URL(input, window.location.origin).pathname.endsWith(
        '/finance/invoices'
      )
    )
      throw new Error('Unexpected synthetic history route');
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'synthetic-invoice',
              notice: 'synthetic-history',
              price: 100,
              total_diff: 0,
              created_at: date,
            },
          ],
          count: 1,
        }),
        { status: 200 }
      )
    );
  });
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 300_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="account-A">
        <NextIntlClientProvider
          locale={locale}
          messages={locale === 'en' ? en : viMessages}
          timeZone="UTC"
          now={new Date('2026-09-01T12:00:00Z')}
        >
          <FinanceRouteProvider prefix="">
            <HistoryBoundary>
              <InvoiceUserHistoryAccordion wsId="ws-1" userId="customer-1" />
            </HistoryBoundary>
          </FinanceRouteProvider>
        </NextIntlClientProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  caught = [];
  transport.mockReset();
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
  // React reports caught render errors; capture only their fixed class above.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function openHistory() {
  await waitFor(() =>
    expect(
      screen.queryByRole('button') ||
        screen.queryByText('Synthetic history boundary')
    ).toBeTruthy()
  );
  expect(caught).toEqual([]);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() =>
    expect(screen.getByText('synthetic-history')).toBeVisible()
  );
}
describe('actual invoice history timestamp rendering boundary', () => {
  for (const locale of ['en', 'vi'] as const) {
    const messages = locale === 'en' ? en : viMessages;
    for (const date of ['infinity', '-infinity', 'synthetic-invalid-date']) {
      it(`${locale}: retains the invoice when its nonempty timestamp cannot be displayed: ${date}`, async () => {
        mount(locale, date);
        await openHistory();
        expect(screen.getByText(messages['ws-invoices'].no_date)).toBeVisible();
        expect(screen.getByRole('link')).toHaveAttribute(
          'href',
          '/ws-1/invoices/synthetic-invoice'
        );
        expect(transport).toHaveBeenCalledOnce();
      });
    }
    for (const date of [null, undefined, '']) {
      it(`${locale}: preserves missing-date history for ${String(date)}`, async () => {
        mount(locale, date);
        await openHistory();
        expect(screen.getByText(messages['ws-invoices'].no_date)).toBeVisible();
        expect(transport).toHaveBeenCalledOnce();
      });
    }
    it(`${locale}: preserves valid timestamp formatting and the invoice link`, async () => {
      mount(locale, '2026-09-01T12:00:00.000Z');
      await openHistory();
      expect(
        screen.getByText(locale === 'en' ? '9/1/2026' : '1/9/2026')
      ).toBeVisible();
      expect(
        screen.queryByText(messages['ws-invoices'].no_date)
      ).not.toBeInTheDocument();
      expect(screen.getByRole('link')).toHaveAttribute(
        'href',
        '/ws-1/invoices/synthetic-invoice'
      );
      expect(transport).toHaveBeenCalledOnce();
    });
  }
});
