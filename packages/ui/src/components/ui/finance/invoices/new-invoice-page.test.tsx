import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NewInvoicePage from './new-invoice-page';

const invoiceMocks = vi.hoisted(() => ({
  StandardInvoice: vi.fn(),
  SubscriptionInvoice: vi.fn(),
}));

const nuqsState = vi.hoisted(() => ({
  invoiceType: 'standard' as 'standard' | 'subscription',
  values: new Map<string, number | null>(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('nuqs', () => ({
  useQueryState: (key: string, options?: { defaultValue?: unknown }) => {
    if (key === 'type') {
      return [nuqsState.invoiceType, vi.fn()];
    }

    if (nuqsState.values.has(key)) {
      return [nuqsState.values.get(key), vi.fn()];
    }

    if (['amount', 'billable_quantity', 'suggested_total'].includes(key)) {
      return [null, vi.fn()];
    }

    return [options?.defaultValue ?? '', vi.fn()];
  },
}));

vi.mock('../../../../hooks/use-local-storage', () => ({
  useLocalStorage: (_key: string, initialValue: boolean) => [
    initialValue,
    vi.fn(),
    true,
  ],
}));

vi.mock('./standard-invoice', () => ({
  StandardInvoice: (props: unknown) => {
    invoiceMocks.StandardInvoice(props);
    return null;
  },
}));

vi.mock('./subscription-invoice', () => ({
  SubscriptionInvoice: (props: unknown) => {
    invoiceMocks.SubscriptionInvoice(props);
    return null;
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderPage(
  props: Partial<ComponentProps<typeof NewInvoicePage>> = {}
) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NewInvoicePage wsId="ws-1" {...props} />
    </QueryClientProvider>
  );
}

describe('NewInvoicePage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoiceMocks.StandardInvoice.mockClear();
    invoiceMocks.SubscriptionInvoice.mockClear();
    nuqsState.invoiceType = 'standard';
    nuqsState.values.clear();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        DEFAULT_CURRENCY: 'SGD',
        DEFAULT_SUBSCRIPTION_CATEGORY_ID: 'category-1',
        default_category_id: 'category-general',
        default_wallet_id: 'wallet-1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('batches default invoice config reads and mounts only the standard invoice tab', async () => {
    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/ws-1/settings/configs?ids=default_wallet_id,default_category_id,DEFAULT_SUBSCRIPTION_CATEGORY_ID,DEFAULT_CURRENCY',
      { cache: 'no-store' }
    );
    expect(invoiceMocks.StandardInvoice).toHaveBeenCalled();
    expect(invoiceMocks.SubscriptionInvoice).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(invoiceMocks.StandardInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          defaultCategoryId: 'category-general',
          defaultCurrency: 'SGD',
          defaultWalletId: 'wallet-1',
        })
      )
    );
  });

  it('mounts only the subscription invoice tab when it is active', async () => {
    nuqsState.invoiceType = 'subscription';

    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(invoiceMocks.StandardInvoice).not.toHaveBeenCalled();
    expect(invoiceMocks.SubscriptionInvoice).toHaveBeenCalled();

    await waitFor(() =>
      expect(invoiceMocks.SubscriptionInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          defaultCategoryId: 'category-1',
          defaultCurrency: 'SGD',
          defaultWalletId: 'wallet-1',
          workspaceTimezone: undefined,
        })
      )
    );
  });

  it('forwards a pending invoice quantity and suggested monetary total', async () => {
    nuqsState.invoiceType = 'subscription';
    nuqsState.values.set('billable_quantity', 3);
    nuqsState.values.set('suggested_total', 1_500_000);

    renderPage();

    await waitFor(() =>
      expect(invoiceMocks.SubscriptionInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          prefillQuantity: 3,
          suggestedTotal: 1_500_000,
        })
      )
    );
  });

  it('keeps legacy amount links working as a quantity fallback', async () => {
    nuqsState.invoiceType = 'subscription';
    nuqsState.values.set('amount', 4);

    renderPage();

    await waitFor(() =>
      expect(invoiceMocks.SubscriptionInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({ prefillQuantity: 4 })
      )
    );
  });

  it('forwards server-seeded defaults and timezone before config refresh completes', async () => {
    nuqsState.invoiceType = 'subscription';
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    renderPage({
      defaultCurrency: 'VND',
      initialDefaultCategoryId: 'category-general-server',
      initialDefaultSubscriptionCategoryId: 'category-subscription-server',
      initialDefaultWalletId: 'wallet-server',
      workspaceTimezone: 'Asia/Ho_Chi_Minh',
    });

    await waitFor(() =>
      expect(invoiceMocks.SubscriptionInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          defaultCategoryId: 'category-subscription-server',
          defaultCurrency: 'VND',
          defaultWalletId: 'wallet-server',
          workspaceTimezone: 'Asia/Ho_Chi_Minh',
        })
      )
    );
  });

  it('falls subscription invoice category back to the transaction default', async () => {
    nuqsState.invoiceType = 'subscription';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        DEFAULT_CURRENCY: 'SGD',
        DEFAULT_SUBSCRIPTION_CATEGORY_ID: null,
        default_category_id: 'category-general',
        default_wallet_id: 'wallet-1',
      }),
    });

    renderPage();

    await waitFor(() =>
      expect(invoiceMocks.SubscriptionInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          defaultCategoryId: 'category-general',
          defaultCurrency: 'SGD',
          defaultWalletId: 'wallet-1',
        })
      )
    );
  });

  it('uses the server-provided currency when batched config read is denied', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    renderPage({ defaultCurrency: 'VND' });

    await waitFor(() =>
      expect(invoiceMocks.StandardInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          defaultCurrency: 'VND',
        })
      )
    );
  });
});
