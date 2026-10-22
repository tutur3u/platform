import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackInbox } from './feedback-inbox';

const api = vi.hoisted(() => ({
  eligibility: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/product-feedback', () => ({
  checkProductFeedbackEligibility: api.eligibility,
  listProductFeedback: api.list,
  getProductFeedback: api.detail,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const item = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Private synthetic title',
  createdAt: '2026-10-22T00:00:00Z',
  status: 'open',
  archivedAt: null,
  revision: 7,
};
function setup(items = [item]) {
  api.eligibility.mockResolvedValue({ eligible: true });
  api.list.mockResolvedValue({ items, nextCursor: 'cursor' });
  api.detail.mockResolvedValue({
    ...item,
    body: '<script>plain private content</script>',
    updatedAt: item.createdAt,
    capabilities: { canManage: false },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FeedbackInbox actor="actor-one" />
    </QueryClientProvider>
  );
  return client;
}
afterEach(() => vi.resetAllMocks());
describe('staff inbox lifecycle', () => {
  it('searches titles, advances one page and resets cursor/detail on filter change', async () => {
    setup();
    await screen.findByText(item.title);
    fireEvent.click(screen.getByText('next'));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'cursor' })
      )
    );
    fireEvent.change(screen.getByLabelText('view'), {
      target: { value: 'archive' },
    });
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ view: 'archive', cursor: undefined })
      )
    );
    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: '  title query  ' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'search' }).closest('form')!
    );
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'title query', cursor: undefined })
      )
    );
  });
  it('renders private detail as text with audit state and hides cached content after denial', async () => {
    const client = setup();
    fireEvent.click(await screen.findByText(item.title));
    expect(
      await screen.findByText('<script>plain private content</script>')
    ).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    api.list.mockRejectedValue(new InternalApiError('forbidden', 403));
    await client.invalidateQueries({
      queryKey: ['product-feedback', 'actor-one', 'list'],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
    expect(
      screen.queryByText('<script>plain private content</script>')
    ).not.toBeInTheDocument();
  });
  it.each([
    [new InternalApiError('missing', 404), 'not-found'],
    [new InternalApiError('temporary', 503), 'load-error'],
    [new Error('transport failure'), 'load-error'],
  ])(
    'keeps the list usable after a detail failure: %s',
    async (error, message) => {
      const other = {
        ...item,
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Another report',
      };
      setup([item, other]);
      api.detail.mockRejectedValueOnce(error);
      fireEvent.click(await screen.findByText(item.title));
      expect(
        await within(screen.getByRole('article')).findByRole('alert')
      ).toHaveTextContent(String(message));
      expect(screen.queryByText('unavailable')).not.toBeInTheDocument();
      expect(screen.getByText(item.title)).toBeInTheDocument();
      fireEvent.click(screen.getByText(other.title));
      expect(
        await screen.findByText('<script>plain private content</script>')
      ).toBeInTheDocument();
      expect(api.detail).toHaveBeenLastCalledWith(other.id);
    }
  );
  it.each([401, 403])(
    'hides the list and cached private detail on authorization loss %s',
    async (status) => {
      const client = setup();
      fireEvent.click(await screen.findByText(item.title));
      await screen.findByText('<script>plain private content</script>');
      api.detail.mockRejectedValue(new InternalApiError('denied', status));
      await client.invalidateQueries({
        queryKey: ['product-feedback', 'actor-one', 'detail'],
      });
      expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
      expect(screen.queryByText(item.title)).not.toBeInTheDocument();
      expect(
        screen.queryByText('<script>plain private content</script>')
      ).not.toBeInTheDocument();
    }
  );
  it('reports a transient list error without claiming access changed', async () => {
    const client = setup();
    await screen.findByText(item.title);
    api.list.mockRejectedValue(new InternalApiError('temporary', 503));
    await client.invalidateQueries({
      queryKey: ['product-feedback', 'actor-one', 'list'],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('load-error');
    expect(screen.queryByText('unavailable')).not.toBeInTheDocument();
  });
  it('does not admit reads on denied eligibility', async () => {
    api.eligibility.mockRejectedValue(new InternalApiError('forbidden', 403));
    api.list.mockResolvedValue({ items: [], nextCursor: null });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <FeedbackInbox actor="denied" />
      </QueryClientProvider>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
    expect(api.list).not.toHaveBeenCalled();
    expect(api.detail).not.toHaveBeenCalled();
  });
});
