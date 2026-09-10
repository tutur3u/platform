// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import { afterEach, expect, it, vi } from 'vitest';

const ask = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api', () => ({
  askPersonalMeetAssistant: ask,
  InternalApiError: class extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./mira-profile', () => ({ MiraProfile: () => <span>Mira</span> }));
vi.mock('./chat-message-body', () => ({
  ChatMessageBody: ({ body }: { body: string }) => <p>{body}</p>,
}));

import { PersonalChat } from './personal-chat';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([422, 409, 503])(
  'retries status %i with a new ID only for a confirmed terminal receipt',
  async (status) => {
    ask
      .mockRejectedValueOnce(new InternalApiError('unavailable', status))
      .mockResolvedValueOnce({ text: 'Answer' });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <PersonalChat meetingId="room" onShare={vi.fn()} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    const first = ask.mock.calls[0]![1].requestId;
    const second = ask.mock.calls[1]![1].requestId;
    if (status === 422) expect(second).not.toBe(first);
    else expect(second).toBe(first);
    await screen.findByText('Answer');
  }
);
