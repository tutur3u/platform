// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api', () => ({ connectedMailRequest: request }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { ConnectedMailCompose } from './connected-mail-compose';

beforeEach(() => vi.clearAllMocks());
it('uses the connected account transport and keeps unsent edits after a send failure', async () => {
  request.mockRejectedValueOnce(new Error('Provider unavailable'));
  const sent = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client: cache },
      createElement(ConnectedMailCompose, {
        workspaceId: 'personal',
        accountId: 'account',
        address: 'me@example.test',
        onClose: vi.fn(),
        onSent: sent,
      })
    )
  );
  fireEvent.change(screen.getByLabelText('connected_to'), {
    target: { value: 'recipient@example.test' },
  });
  fireEvent.change(screen.getByLabelText('connected_body'), {
    target: { value: 'Keep my edits' },
  });
  fireEvent.click(screen.getByText('send'));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Provider unavailable'
    )
  );
  expect(
    (screen.getByLabelText('connected_body') as HTMLTextAreaElement).value
  ).toBe('Keep my edits');
  expect(sent).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith(
    'personal',
    ['account', 'send'],
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        to: ['recipient@example.test'],
        text: 'Keep my edits',
      }),
    })
  );
});
