import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../apps/contacts/messages/en.json';
import viMessages from '../../../../../../../../apps/contacts/messages/vi.json';
import { WorkspaceVisibilityProvider } from '../../../../../hooks/use-workspace-visibility';
import { FinanceRouteProvider } from '../../finance-route-context';
import { InvoiceUserHistoryAccordion } from './invoice-user-history-accordion';

const transport = vi.fn();
let observers: IntersectionObserverCallback[] = [];
const labels = {
  en: {
    error: 'Invoice history could not be loaded. Try again.',
    retry: 'Retry',
  },
  vi: {
    error: 'Không thể tải lịch sử hóa đơn. Vui lòng thử lại.',
    retry: 'Thử lại',
  },
};
function reply(label?: string, count = 0, id = 'synthetic-invoice') {
  return new Response(
    JSON.stringify({
      data: label
        ? [
            {
              id,
              notice: label,
              price: 100,
              total_diff: 0,
              created_at: '2026-09-01T12:00:00.000Z',
            },
          ]
        : [],
      count,
    }),
    { status: 200 }
  );
}
function failure(status: number) {
  return new Response(
    JSON.stringify({ message: 'Synthetic private server diagnostic' }),
    { status }
  );
}
function held() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount(locale: 'en' | 'vi') {
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
            <InvoiceUserHistoryAccordion wsId="ws-1" userId="customer-1" />
          </FinanceRouteProvider>
        </NextIntlClientProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  return client;
}
beforeEach(() => {
  transport.mockReset();
  observers = [];
  transport.mockImplementation((input: string) => {
    if (
      !new URL(input, window.location.origin).pathname.endsWith(
        '/finance/invoices'
      )
    )
      throw new Error('Unexpected synthetic history route');
    return Promise.resolve(reply());
  });
  vi.stubGlobal('fetch', transport);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback);
      }
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

describe('actual invoice history failure presentation and recovery', () => {
  for (const locale of ['en', 'vi'] as const) {
    const messages = locale === 'en' ? en : viMessages;
    for (const status of [403, 503]) {
      it(`${locale}: distinguishes initial ${status} failure from successful empty history and recovers`, async () => {
        transport.mockImplementationOnce(() =>
          Promise.resolve(failure(status))
        );
        mount(locale);
        const error = await screen.findByRole('alert');
        expect(error).toHaveTextContent(labels[locale].error);
        expect(
          screen.queryByText(
            messages['ws-invoices'].no_transaction_or_invoice_history
          )
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('Synthetic private server diagnostic')
        ).not.toBeInTheDocument();
        expect(transport).toHaveBeenCalledOnce();
        const pending = held();
        transport.mockReturnValueOnce(pending.promise);
        const retry = screen.getByRole('button', {
          name: labels[locale].retry,
        });
        fireEvent.click(retry);
        await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
        expect(retry).toBeDisabled();
        fireEvent.click(retry);
        expect(transport).toHaveBeenCalledTimes(2);
        await act(async () => {
          pending.resolve(reply());
          await pending.promise;
        });
        await screen.findByText(
          messages['ws-invoices'].no_transaction_or_invoice_history
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    }
    it(`${locale}: refuses a queued old observer callback after a page failure`, async () => {
      transport.mockImplementation((input: string) =>
        Promise.resolve(
          new URL(input, window.location.origin).searchParams.get('page') ===
            '2'
            ? failure(503)
            : reply('loaded-history', 11)
        )
      );
      mount(locale);
      fireEvent.click(
        await screen.findByRole('button', {
          name: new RegExp(messages['ws-invoices'].plural),
        })
      );
      await waitFor(() => expect(observers.length).toBeGreaterThan(0));
      const oldObserver = observers[0];
      fireEvent.click(
        screen.getByRole('button', { name: messages['ws-invoices'].load_more })
      );
      await screen.findByRole('alert');
      expect(
        screen.queryByRole('button', {
          name: messages['ws-invoices'].load_more,
        })
      ).not.toBeInTheDocument();
      expect(transport).toHaveBeenCalledTimes(2);
      await act(async () => {
        oldObserver?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
        await Promise.resolve();
      });
      expect(transport).toHaveBeenCalledTimes(2);
      expect(screen.getByText('loaded-history')).toBeVisible();
    });
    it(`${locale}: presents genuine empty success without a failure or retry`, async () => {
      mount(locale);
      await screen.findByText(
        messages['ws-invoices'].no_transaction_or_invoice_history
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: labels[locale].retry })
      ).not.toBeInTheDocument();
      expect(transport).toHaveBeenCalledOnce();
    });
    it(`${locale}: retains loaded rows on a page failure and retries the failed page`, async () => {
      transport.mockImplementation((input: string) =>
        Promise.resolve(
          new URL(input, window.location.origin).searchParams.get('page') ===
            '2'
            ? failure(503)
            : reply('loaded-history', 11)
        )
      );
      mount(locale);
      fireEvent.click(
        await screen.findByRole('button', {
          name: new RegExp(messages['ws-invoices'].plural),
        })
      );
      await waitFor(() =>
        expect(screen.getByText('loaded-history')).toBeVisible()
      );
      fireEvent.click(
        screen.getByRole('button', { name: messages['ws-invoices'].load_more })
      );
      const error = await screen.findByRole('alert');
      expect(error).toHaveTextContent(labels[locale].error);
      expect(screen.getByText('loaded-history')).toBeVisible();
      expect(
        screen.queryByText(
          messages['ws-invoices'].no_transaction_or_invoice_history
        )
      ).not.toBeInTheDocument();
      transport.mockImplementation((input: string) =>
        Promise.resolve(
          new URL(input, window.location.origin).searchParams.get('page') ===
            '2'
            ? reply('recovered-page', 11, 'synthetic-second')
            : reply('loaded-history', 11)
        )
      );
      fireEvent.click(
        screen.getByRole('button', { name: labels[locale].retry })
      );
      await waitFor(() =>
        expect(screen.getByText('recovered-page')).toBeVisible()
      );
      expect(screen.getByText('loaded-history')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        new URL(
          transport.mock.calls.at(-1)?.[0],
          window.location.origin
        ).searchParams.get('page')
      ).toBe('2');
    });
  }
});
