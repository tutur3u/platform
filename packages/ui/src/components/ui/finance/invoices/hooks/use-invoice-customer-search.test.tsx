import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvoiceCustomerSearch } from './use-invoice-customer-search';

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('../internal-api', () => ({
  listWorkspaceUsersWithInternalApi: api.list,
  getWorkspaceUserWithInternalApi: api.get,
}));

beforeEach(() => {
  api.list.mockReset();
  api.get.mockReset();
});

function renderSearch(selectedUserId = '') {
  const client = new QueryClient();
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return renderHook(
    () => useInvoiceCustomerSearch('ws-1', '', selectedUserId),
    {
      wrapper: Wrapper,
    }
  );
}

describe('invoice customer loading recovery', () => {
  it('surfaces a failed read immediately and allows a manual retry', async () => {
    api.list.mockRejectedValueOnce(new Error('Timed out')).mockResolvedValue({
      data: [{ id: 'customer-1' }],
      count: 1,
    });
    const { result } = renderSearch();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isLoading).toBe(false);
    expect(api.list).toHaveBeenCalledOnce();

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.customers).toEqual([{ id: 'customer-1' }]);
  });

  it('retries the selected customer as well as the customer list', async () => {
    api.list.mockResolvedValue({ data: [], count: 0 });
    api.get
      .mockRejectedValueOnce(new Error('Timed out'))
      .mockResolvedValue({ id: 'selected' });
    const { result } = renderSearch('selected');
    await waitFor(() => expect(result.current.error).toBeTruthy());
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() =>
      expect(result.current.selectedUser?.id).toBe('selected')
    );
    expect(result.current.error).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('ignores an old detail error once the list contains the selected customer', async () => {
    api.list.mockResolvedValueOnce({ data: [], count: 0 }).mockResolvedValue({
      data: [{ id: 'selected' }],
      count: 1,
    });
    api.get.mockRejectedValue(new Error('Detail unavailable'));
    const { result } = renderSearch('selected');
    await waitFor(() => expect(result.current.error).toBeTruthy());
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.selectedUser?.id).toBe('selected');
  });

  it('stops offering more customers when an empty page has a stale count', async () => {
    api.list.mockResolvedValue({ data: [], count: 10 });
    const { result } = renderSearch();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});
