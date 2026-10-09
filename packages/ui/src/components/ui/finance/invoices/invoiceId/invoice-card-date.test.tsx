import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Component, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../apps/contacts/messages/en.json';
import viMessages from '../../../../../../../../apps/contacts/messages/vi.json';
import { WorkspaceVisibilityProvider } from '../../../../../hooks/use-workspace-visibility';
import InvoiceCard from './invoice-card';

let caught: string[] = [];
class DateBoundary extends Component<
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
      <p>Synthetic date boundary</p>
    ) : (
      this.props.children
    );
  }
}
function invoice(id: string): ComponentProps<typeof InvoiceCard>['invoice'] {
  return {
    id,
    category_id: 'synthetic-category',
    completed_at: null,
    creator_id: null,
    customer_id: null,
    note: null,
    notice: null,
    paid_amount: 0,
    platform_creator_id: null,
    subscription_months: null,
    transaction_id: null,
    valid_until: null,
    wallet_id: 'synthetic-wallet',
    ws_id: 'synthetic-workspace',
    created_at: '2026-10-01T10:00:00Z',
    price: 100,
    total_diff: 0,
    customer_display_name: `Customer ${id}`,
    customer_full_name: null,
    wallet: null,
    creator: null,
  };
}
function mount(locale: 'en' | 'vi', compact: boolean) {
  window.localStorage.setItem('invoice-compact-view', JSON.stringify(compact));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (created_at: string | null) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="synthetic-account">
        <NextIntlClientProvider
          locale={locale}
          messages={locale === 'en' ? en : viMessages}
          timeZone="UTC"
          now={new Date('2026-10-01T10:00:00Z')}
        >
          <DateBoundary>
            <InvoiceCard
              wsId="synthetic-workspace"
              lang={locale}
              configs={[]}
              invoice={{ ...invoice('synthetic-invoice'), created_at }}
              products={[]}
              promotions={[]}
            />
          </DateBoundary>
        </NextIntlClientProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const view = render(content('2026-10-01T10:00:00Z'));
  return {
    ...view,
    replaceDate: (value: string | null) => view.rerender(content(value)),
  };
}
beforeEach(() => {
  caught = [];
  window.localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected synthetic card request');
    })
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const locale of ['en', 'vi'] as const) {
  for (const compact of [false, true]) {
    describe(`${locale} actual ${compact ? 'compact' : 'full'} invoice card date`, () => {
      const messages = locale === 'en' ? en : viMessages;
      async function ready() {
        expect(
          await screen.findByRole('tab', {
            name: messages.invoices[compact ? 'compact' : 'full'],
          })
        ).toHaveAttribute('aria-selected', 'true');
      }
      for (const date of ['not-a-date', ' ', '2026-13-40T10:00:00Z']) {
        it(`keeps the actual card usable for unrenderable date ${JSON.stringify(date)}`, async () => {
          const view = mount(locale, compact);
          await ready();
          view.replaceDate(date);
          expect(caught).toEqual([]);
          expect(
            screen.queryByText('Synthetic date boundary')
          ).not.toBeInTheDocument();
          expect(screen.getByText('Customer synthetic-invoice')).toBeVisible();
          expect(
            screen.getByRole('button', { name: messages.common.export })
          ).toBeEnabled();
          expect(
            document.getElementById('printable-area')?.textContent
          ).not.toContain('Invalid Date');
          if (date.trim())
            expect(
              document.getElementById('printable-area')?.textContent
            ).not.toContain(date);
        });
      }
      for (const date of [null, '']) {
        it(`preserves the existing missing date omission for ${JSON.stringify(date)}`, async () => {
          const view = mount(locale, compact);
          await ready();
          view.replaceDate(date);
          expect(caught).toEqual([]);
          expect(screen.getByText('Customer synthetic-invoice')).toBeVisible();
          expect(
            document.getElementById('printable-area')?.textContent
          ).not.toContain(messages.invoices.invoice_date);
        });
      }
      it('preserves locale formatting and preview controls for valid dates', async () => {
        mount(locale, compact);
        await ready();
        const expected = new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date('2026-10-01T10:00:00Z'));
        expect(
          document.getElementById('printable-area')?.textContent
        ).toContain(expected);
        expect(caught).toEqual([]);
        expect(
          screen.getByRole('button', { name: messages.common.export })
        ).toBeEnabled();
      });
    });
  }
}
