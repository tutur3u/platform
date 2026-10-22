import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
function setup() {
  api.eligibility.mockResolvedValue({ eligible: true });
  api.list.mockResolvedValue({ items: [item], nextCursor: 'cursor' });
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
    api.list.mockRejectedValue(new Error('forbidden'));
    await client.invalidateQueries({
      queryKey: ['product-feedback', 'actor-one', 'list'],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
    expect(
      screen.queryByText('<script>plain private content</script>')
    ).not.toBeInTheDocument();
  });
  it('does not admit reads on denied eligibility', async () => {
    api.eligibility.mockRejectedValue(new Error('forbidden'));
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
