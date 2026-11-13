import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserFilter } from './user-filter';

const mocks = vi.hoisted(() => ({
  listFinanceFilterUsers: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listFinanceFilterUsers: (
    ...args: Parameters<typeof mocks.listFinanceFilterUsers>
  ) => mocks.listFinanceFilterUsers(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderUserFilter(
  filterType: 'all' | 'transaction_creators' | 'invoice_creators' = 'all'
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserFilter
        wsId="ws-1"
        selectedUserIds={[]}
        onUsersChange={vi.fn()}
        filterType={filterType}
      />
    </QueryClientProvider>
  );
}

describe('user filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    Element.prototype.scrollIntoView = vi.fn();
    mocks.listFinanceFilterUsers.mockResolvedValue([]);
  });

  it('loads workspace users through the finance filter helper', async () => {
    renderUserFilter();

    await waitFor(() => {
      expect(mocks.listFinanceFilterUsers).toHaveBeenCalledWith('ws-1', {
        type: 'all',
      });
    });
  });

  it('renders current invoice creator names and the unknown-user fallback', async () => {
    mocks.listFinanceFilterUsers.mockResolvedValue([
      { id: 'linked', display_name: 'Current profile name' },
      { id: 'platform-only', display_name: 'Platform-only profile' },
      { id: 'missing', display_name: null },
    ]);
    renderUserFilter('invoice_creators');
    fireEvent.click(
      screen.getByRole('button', { name: 'finance.filter_by_creator' })
    );
    expect(await screen.findByText('Current profile name')).toBeVisible();
    expect(screen.getByText('Platform-only profile')).toBeVisible();
    expect(screen.getByText('finance.unknown_user')).toBeVisible();
  });

  it('passes creator filter type to the finance filter helper', async () => {
    renderUserFilter('transaction_creators');

    await waitFor(() => {
      expect(mocks.listFinanceFilterUsers).toHaveBeenCalledWith('ws-1', {
        type: 'transaction_creators',
      });
    });
  });
});
