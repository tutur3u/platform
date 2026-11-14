// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackForm } from './feedback-form';

const api = vi.hoisted(() => ({ send: vi.fn(), read: vi.fn() }));
vi.mock('@tuturuuu/internal-api/product-feedback', () => ({
  submitProductFeedback: api.send,
  getProductFeedbackReceipt: api.read,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({
    onSuccess,
    onExpire,
  }: {
    onSuccess(token: string): void;
    onExpire(): void;
  }) => (
    <div>
      <button type="button" onClick={() => onSuccess('synthetic-challenge')}>
        verify
      </button>
      <button type="button" onClick={onExpire}>
        expire
      </button>
    </div>
  ),
}));
const receipt = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-11-13T00:00:00Z',
};
function setup(siteKey: string | undefined = 'public-key') {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FeedbackForm siteKey={siteKey} />
    </QueryClientProvider>
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText('title'), {
    target: { value: 'Synthetic bug' },
  });
  fireEvent.change(screen.getByLabelText('details'), {
    target: { value: 'Synthetic details' },
  });
  fireEvent.click(screen.getByText('verify'));
}
afterEach(() => vi.resetAllMocks());
describe('feedback form recovery', () => {
  it('shows confirmed storage only after receiving a valid receipt', async () => {
    api.send.mockResolvedValue(receipt);
    setup();
    expect(screen.getByRole('button', { name: 'send' })).toBeDisabled();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('success');
    expect(screen.getByText(receipt.id)).toBeInTheDocument();
    expect(api.send).toHaveBeenCalledTimes(1);
  });
  it('blocks expired challenges', () => {
    setup();
    fill();
    fireEvent.click(screen.getByText('expire'));
    expect(screen.getByRole('button', { name: 'send' })).toBeDisabled();
    expect(api.send).not.toHaveBeenCalled();
  });
  it('retains text and uses an owner receipt check after a lost response', async () => {
    api.send.mockRejectedValue(new Error('lost response'));
    api.read.mockResolvedValue({ receipt });
    setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('uncertain');
    expect(screen.getByLabelText('title')).toHaveValue('Synthetic bug');
    expect(screen.getByLabelText('title')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'check' }));
    expect(await screen.findByRole('status')).toHaveTextContent('success');
    expect(api.send).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])(
    'hides draft controls after actor denial %s',
    async (status) => {
      api.send.mockRejectedValue(
        new InternalApiError('private details', status)
      );
      setup();
      fill();
      fireEvent.click(screen.getByRole('button', { name: 'send' }));
      await waitFor(() =>
        expect(screen.queryByLabelText('title')).not.toBeInTheDocument()
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        status === 401 ? 'login' : 'forbidden'
      );
      expect(screen.queryByText('private details')).not.toBeInTheDocument();
    }
  );
});
