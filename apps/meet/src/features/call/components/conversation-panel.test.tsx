// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { ConversationPanel } from './conversation-panel';

const ask = vi.hoisted(() => vi.fn(async () => ({ text: 'Private answer' })));
vi.mock('@tuturuuu/internal-api', () => ({ askPersonalMeetAssistant: ask }));
vi.mock('./chat-panel', () => ({ ChatPanel: () => <div>Room history</div> }));
vi.mock('./mira-profile', () => ({ MiraProfile: () => <span>Mira</span> }));
vi.mock('./chat-message-body', () => ({
  ChatMessageBody: ({ body }: { body: string }) => <p>{body}</p>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('keeps a solo conversation private when another device joins and shares only reviewed text', async () => {
  const onSendChat = vi.fn(async () => ({ id: 'shared' }));
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const content = (solo: boolean) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConversationPanel
          solo={solo}
          chat={[]}
          meetingId="meeting"
          selfUserId="me"
          onSendChat={onSendChat}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(content(true));
  expect(
    screen
      .getByRole('tab', { name: 'Private Mira' })
      .getAttribute('aria-selected')
  ).toBe('true');
  fireEvent.change(screen.getByRole('textbox', { name: 'Private Mira' }), {
    target: { value: 'Personal question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Private answer');
  expect(onSendChat).not.toHaveBeenCalled();
  rerender(content(false));
  expect(
    screen
      .getByRole('tab', { name: 'Private Mira' })
      .getAttribute('aria-selected')
  ).toBe('true');
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.call.personal_share })
  );
  expect(onSendChat).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByRole('textbox', { name: messages.meet.call.personal_share }),
    { target: { value: 'Only this approved excerpt' } }
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: messages.meet.call.personal_share_confirm,
    })
  );
  await waitFor(() =>
    expect(onSendChat).toHaveBeenCalledWith('Only this approved excerpt')
  );
  expect(ask).toHaveBeenCalledOnce();
  client.clear();
});
