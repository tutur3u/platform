import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletsDataTable } from './wallets-data-table';

const mocks = vi.hoisted(() => ({
  dataTableProps: undefined as
    | {
        data?: Array<{ id: string; name?: string | null }>;
        onRefresh?: () => void;
        onSearch?: (query: string) => void;
      }
    | undefined,
  listInfiniteWallets: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listInfiniteWallets: (
    ...args: Parameters<typeof mocks.listInfiniteWallets>
  ) => mocks.listInfiniteWallets(...args),
}));

vi.mock('@tuturuuu/ui/custom/modifiable-dialog-trigger', () => ({
  default: () => null,
}));

vi.mock('@tuturuuu/ui/custom/tables/data-table', () => ({
  DataTable: (props: {
    data?: Array<{ id: string; name?: string | null }>;
    onRefresh?: () => void;
    onSearch?: (query: string) => void;
  }) => {
    mocks.dataTableProps = props;

    return (
      <div data-testid="wallet-table">
        {(props.data ?? []).map((wallet) => (
          <div key={wallet.id}>{wallet.name}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('@tuturuuu/ui/finance/wallets/columns', () => ({
  walletColumns: vi.fn(),
}));

vi.mock('@tuturuuu/ui/finance/wallets/form', () => ({
  WalletForm: () => null,
}));

vi.mock('@tuturuuu/ui/hooks/use-exchange-rates', () => ({
  useExchangeRates: () => ({
    data: {
      data: [],
    },
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ws-1/finance/wallets',
  useRouter: () => ({
    replace: (...args: Parameters<typeof mocks.replace>) =>
      mocks.replace(...args),
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key}:${Object.values(values)
            .map((value) => String(value))
            .join(',')}`
        : key,
}));

vi.mock('../shared/use-finance-balance-mode', () => ({
  useFinanceBalanceMode: () => ({
    mode: 'audited',
  }),
}));

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('wallets data table infinite loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dataTableProps = undefined;
    mocks.searchParams = new URLSearchParams();

    globalThis.IntersectionObserver = class IntersectionObserver {
      disconnect() {}
      observe() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
    } as unknown as typeof IntersectionObserver;

    mocks.listInfiniteWallets.mockImplementation(
      async (
        _workspaceId: string,
        query: {
          offset?: number;
        }
      ) => {
        if (query.offset === 20) {
          return {
            data: [{ id: 'wallet-2', name: 'Bank' }],
            hasMore: false,
            nextOffset: null,
            totalCount: 2,
          };
        }

        return {
          data: [{ id: 'wallet-1', name: 'Cash' }],
          hasMore: true,
          nextOffset: 20,
          totalCount: 2,
        };
      }
    );
  });

  it('loads the next server page from the fallback load-more button', async () => {
    renderWithQueryClient(
      <WalletsDataTable wsId="ws-1" currency="USD" query="bank" />
    );

    expect(await screen.findByText('Cash')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'wallet-data-table.load_more' })
    );

    expect(await screen.findByText('Bank')).toBeInTheDocument();
    expect(mocks.listInfiniteWallets).toHaveBeenCalledWith('ws-1', {
      limit: 20,
      offset: 20,
      q: 'bank',
    });
  });

  it('keeps search in the URL and drops legacy page params', async () => {
    mocks.searchParams = new URLSearchParams('page=2&pageSize=50');

    renderWithQueryClient(<WalletsDataTable wsId="ws-1" currency="USD" />);

    await waitFor(() => expect(mocks.dataTableProps).toBeDefined());
    mocks.dataTableProps?.onSearch?.(' cash ');

    expect(mocks.replace).toHaveBeenCalledWith('/ws-1/finance/wallets?q=cash');
  });
});
