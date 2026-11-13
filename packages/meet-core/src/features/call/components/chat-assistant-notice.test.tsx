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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  listMeetAssistantReviews: async () => [],
  askMeetAssistant: f.ask,
  discardMeetChatFile: vi.fn(async () => undefined),
  readMeetChatFile: vi.fn(),
  uploadMeetChatFile: vi.fn(),
}));
vi.mock('./assistant-workspace-picker', () => ({
  AssistantWorkspacePicker: () => null,
  isCurrentAssistantWorkspace: () => true,
  useAssistantWorkspaceSelection: () => ({
    allowed: true,
    value: 'personal',
    actor: null,
  }),
}));
vi.mock('./mira-profile', () => ({
  MiraAvatar: () => null,
  MiraProfile: () => null,
}));
vi.mock('./assistant-private-review', () => ({
  AssistantPrivateReview: () => null,
}));
import { assistantFailureNotice, ChatPanel } from './chat-panel';

const call = messages.meet.call;
beforeEach(() => {
  f.ask.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function ask(body: string) {
  const onSendChat = vi.fn(async () => ({ id: 'synthetic-message' }));
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChatPanel
          chat={[]}
          onSendChat={onSendChat}
          selfUserId="self"
          accountId="synthetic-account"
          meetingId="synthetic-meeting"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByRole('textbox', { name: call.chat }), {
    target: { value: body },
  });
  fireEvent.click(screen.getByRole('button', { name: call.send }));
  return onSendChat;
}

for (const mention of ['@mira', '@ttr', '@tuturuuu'])
  it(`shows Room Mira as unavailable in chat when ${mention} is denied`, async () => {
    f.ask.mockRejectedValue(
      Object.assign(new Error('Room AI chat is unavailable'), { status: 403 })
    );
    const sent = ask(`${mention} summarize`);
    expect((await screen.findByRole('alert')).textContent).toBe(
      call.assistant_private_only
    );
    expect(sent).toHaveBeenCalledWith(`${mention} summarize`, []);
    expect(f.ask).toHaveBeenCalledWith(
      'synthetic-meeting',
      'synthetic-message',
      expect.any(String),
      undefined
    );
  });

it('keeps other assistant failures distinct from the room denial', async () => {
  f.ask.mockRejectedValue(
    Object.assign(new Error('Unavailable'), { status: 503 })
  );
  ask('@mira summarize');
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe(call.assistant_failed)
  );
  expect(assistantFailureNotice({ status: 403 })).toBe('room_unavailable');
  expect(assistantFailureNotice(new TypeError('Failed to fetch'))).toBe(
    'failed'
  );
});

it('does not call the room assistant for plain chat', async () => {
  const sent = ask('hello everyone');
  await waitFor(() => expect(sent).toHaveBeenCalled());
  expect(f.ask).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});
