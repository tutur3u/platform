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

const { ask, readPolicy, setChoice } = vi.hoisted(() => ({
  ask: vi.fn(),
  readPolicy: vi.fn(),
  setChoice: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  askPersonalMeetAssistant: ask,
  readPrivateMiraPolicy: readPolicy,
  setPrivateMiraChoice: setChoice,
  InternalApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
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

it('confirms the current account choice and retries the same private request', async () => {
  ask
    .mockRejectedValueOnce(
      new InternalApiError('Consent required', 403, 'MIRA_CONSENT_REQUIRED')
    )
    .mockResolvedValueOnce({ text: 'Private answer' });
  readPolicy
    .mockResolvedValueOnce({
      accountId: 'actor',
      available: true,
      version: 'notice',
      choice: null,
    })
    .mockResolvedValueOnce({
      accountId: 'actor',
      available: true,
      version: 'notice',
      choice: { choice: 'continue', accountId: 'actor', meetingId: 'room' },
    });
  setChoice.mockResolvedValue({});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PersonalChat meetingId="room" accountId="actor" onShare={vi.fn()} />
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'send' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'personal_enable' })
  );
  expect(setChoice).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'phase_continue' }));
  await screen.findByText('Private answer');
  expect(setChoice).toHaveBeenCalledExactlyOnceWith(
    'room',
    'notice',
    'continue',
    'actor'
  );
  expect(ask.mock.calls[1]?.[1]).toEqual(ask.mock.calls[0]?.[1]);
});

it('offers workspace settings without writing consent for an ineligible workspace', async () => {
  ask.mockRejectedValueOnce(
    new InternalApiError(
      'Workspace ineligible',
      403,
      'MIRA_WORKSPACE_UNAVAILABLE'
    )
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PersonalChat
        meetingId="room"
        accountId="actor"
        wsId="workspace"
        onShare={vi.fn()}
      />
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'personal_chat' }), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'send' }));
  const settings = await screen.findByRole('link', {
    name: 'personal_workspace_settings',
  });
  expect(settings.getAttribute('href')).toBe(
    'https://workspace.tuturuuu.com/en/workspace/settings'
  );
  expect(screen.queryByRole('button', { name: 'personal_enable' })).toBeNull();
  expect(setChoice).not.toHaveBeenCalled();
});
