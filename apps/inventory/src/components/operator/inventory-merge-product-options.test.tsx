import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InventoryMergeProductSelect,
  useInventoryMergeProductLabels,
} from './inventory-merge-product-options';

const api = vi.hoisted(() => ({ list: vi.fn(), product: vi.fn() }));
vi.mock('@tuturuuu/internal-api/inventory', () => ({
  listInventoryProducts: api.list,
  getInventoryProduct: api.product,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('use-debounce', () => ({ useDebounce: (value: string) => [value] }));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: {
    ariaLabel: string;
    options: { value: string; label: string }[];
    onSearchChange: (value: string) => void;
    onOpenChange: (open: boolean) => void;
    hasMore: boolean;
    onLoadMore: () => void;
    loadMoreText: string;
  }) => (
    <div>
      <input
        aria-label={props.ariaLabel}
        onChange={(event) => props.onSearchChange(event.target.value)}
      />
      <button type="button" onClick={() => props.onOpenChange(false)}>
        Close options
      </button>
      {props.options.map((row) => (
        <p key={row.value}>{row.label}</p>
      ))}
      {props.hasMore ? (
        <button type="button" onClick={props.onLoadMore}>
          {props.loadMoreText}
        </button>
      ) : null}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function renderQuery(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
describe('independent merge product lookup', () => {
  it('searches active products independently and can reach later pages without table rows', async () => {
    api.list.mockImplementation(async (_ws, query) =>
      query.q
        ? { data: [{ id: 'outside-table', name: 'Remote match' }], count: 1 }
        : {
            data: [{ id: `page-${query.page}`, name: `Page ${query.page}` }],
            count: 6,
          }
    );
    renderQuery(
      <InventoryMergeProductSelect
        disabled={false}
        excludeId="page-1"
        label="Source"
        onChange={vi.fn()}
        value=""
        wsId="workspace"
      />
    );
    await screen.findByRole('button', { name: 'loadMore' });
    expect(screen.queryByText('Page 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'loadMore' }));
    await screen.findByText('Page 2');
    expect(api.list).toHaveBeenCalledWith(
      'workspace',
      expect.objectContaining({ page: 2, pageSize: 50, status: 'active' })
    );
    for (let page = 3; page <= 6; page++) {
      fireEvent.click(screen.getByRole('button', { name: 'loadMore' }));
      await screen.findByText(`Page ${page}`);
    }
    expect(screen.queryByRole('button', { name: 'loadMore' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Source' }), {
      target: { value: 'Remote' },
    });
    await screen.findByText('Remote match');
    expect(api.list).toHaveBeenLastCalledWith(
      'workspace',
      expect.objectContaining({ page: 1, q: 'Remote', status: 'active' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close options' }));
    await screen.findByText('Page 6');
    await waitFor(() => expect(screen.queryByText('Remote match')).toBeNull());
  });
  it('keeps an explicit retry available after lookup failure', async () => {
    api.list
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue({ data: [{ id: 'a', name: 'Recovered' }], count: 1 });
    renderQuery(
      <InventoryMergeProductSelect
        disabled={false}
        excludeId=""
        label="Source"
        onChange={vi.fn()}
        value=""
        wsId="workspace"
      />
    );
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await screen.findByText('Recovered');
  });
  it('resolves distinct warehouse stock product names and skips known labels', async () => {
    api.product.mockImplementation(async (_ws, id) => ({
      id,
      name: `Name ${id}`,
    }));
    function Labels() {
      const query = useInventoryMergeProductLabels(
        'workspace',
        ['a', 'b', 'b'],
        [{ id: 'a', name: 'Known' }]
      );
      return <p>{query.data?.map((row) => row.name).join(',')}</p>;
    }
    renderQuery(<Labels />);
    await waitFor(() => expect(screen.getByText('Name b')).toBeDefined());
    expect(api.product).toHaveBeenCalledExactlyOnceWith('workspace', 'b');
  });
  it('bounds warehouse name requests to four while resolving more than two batches', async () => {
    let active = 0;
    let maximum = 0;
    api.product.mockImplementation(async (_ws, id) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return { id, name: `Name ${id}` };
    });
    function Labels() {
      const query = useInventoryMergeProductLabels(
        'workspace',
        Array.from({ length: 9 }, (_, i) => `id-${i}`)
      );
      return <p>{query.data?.length ?? 0}</p>;
    }
    renderQuery(<Labels />);
    await screen.findByText('9');
    expect(api.product).toHaveBeenCalledTimes(9);
    expect(maximum).toBe(4);
  });
  it('does not return a partially labeled warehouse review when a product name is missing', async () => {
    api.product.mockResolvedValue({ id: 'missing', name: null });
    function Labels() {
      const query = useInventoryMergeProductLabels('workspace', ['missing']);
      return (
        <p>
          {query.isError ? 'Label error' : query.data ? 'Ready' : 'Loading'}
        </p>
      );
    }
    renderQuery(<Labels />);
    await screen.findByText('Label error');
    expect(screen.queryByText('Ready')).toBeNull();
  });
  it('shows a selected-name error and retry instead of loading forever', async () => {
    api.list.mockResolvedValue({ data: [], count: 0 });
    api.product
      .mockResolvedValueOnce({ id: 'selected', name: null })
      .mockResolvedValue({ id: 'selected', name: 'Recovered selection' });
    renderQuery(
      <InventoryMergeProductSelect
        disabled={false}
        excludeId=""
        label="Source"
        onChange={vi.fn()}
        value="selected"
        wsId="workspace"
      />
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('labelsError');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(api.product).toHaveBeenCalledTimes(2);
  });
});
