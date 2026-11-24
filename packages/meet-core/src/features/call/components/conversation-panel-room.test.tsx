// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vi_messages from '../../../../../../apps/meet/messages/vi.json';

const f = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  listMeetAssistantReviews: async () => [],
  askMeetAssistant: f.ask,
  askPersonalMeetAssistant: vi.fn(),
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
vi.mock('./personal-chat', () => ({ PersonalChat: () => <div>Private</div> }));
import { ConversationPanel } from './conversation-panel';

const call = messages.meet.call;
beforeEach(() => {
  f.ask.mockReset();
  f.ask.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
});
afterEach(cleanup);

function show() {
  const onSendChat = vi.fn(async () => ({ id: 'sent' }));
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConversationPanel
          solo={false}
          chat={[]}
          meetingId="meeting"
          accountId="synthetic-account"
          selfUserId="me"
          onSendChat={onSendChat}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return onSendChat;
}

it('names the tabs Meeting Room and Private Assistant in English and Vietnamese', () => {
  show();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'Meeting Room',
    'Private Assistant',
  ]);
  const vn = vi_messages.meet.call.miraEverywhere;
  expect([vn.roomTab, vn.tutor.tab]).toEqual(['Phòng họp', 'Trợ lý riêng']);
});

it('keeps the room audience note in the empty state only', () => {
  show();
  expect(screen.getAllByText(call.room_chat_audience)).toHaveLength(1);
  const empty = screen.getByText(call.chat_empty).parentElement;
  expect(empty?.textContent).toContain(call.room_chat_audience);
});

it('keeps the host /summary command working in the Meeting Room tab', async () => {
  const sent = show();
  const composer = screen.getByRole('textbox', { name: call.chat });
  fireEvent.change(composer, { target: { value: '/summary' } });
  const option = within(screen.getByRole('listbox')).getByRole('option', {
    name: /^\/summary/,
  });
  fireEvent.click(option);
  expect((composer as HTMLTextAreaElement).value).toBe(
    '@Tuturuuu Summarize this conversation.'
  );
  fireEvent.keyDown(composer, { key: 'Enter' });
  await waitFor(() =>
    expect(sent).toHaveBeenCalledWith(
      '@Tuturuuu Summarize this conversation.',
      []
    )
  );
  expect(f.ask).toHaveBeenCalledOnce();
});

it('puts Summary, Decisions and Action items behind one Ask Mira button', () => {
  show();
  const composer = screen.getByRole('textbox', { name: call.chat });
  for (const name of ['Summary', 'Decisions', 'Action items'])
    expect(screen.queryByRole('button', { name })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: call.ask_mira }));
  expect(
    ['Summary', 'Decisions', 'Action items'].map(
      (name) => screen.getByRole('button', { name }).textContent
    )
  ).toEqual(['Summary', 'Decisions', 'Action items']);
  fireEvent.click(screen.getByRole('button', { name: 'Decisions' }));
  expect((composer as HTMLTextAreaElement).value).toBe(
    `@mira ${call.decisions_prompt}`
  );
  expect(screen.queryByRole('button', { name: 'Decisions' })).toBeNull();
});

it('keeps the composer to attach, Ask Mira, the input and send', () => {
  show();
  const form = screen.getByRole('textbox', { name: call.chat }).closest('form');
  expect(
    within(form as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
  ).toEqual([call.attach_files, call.ask_mira, call.send]);
  expect(screen.queryByText('18+')).toBeNull();
});

it('ships the Ask Mira labels in Vietnamese', () => {
  const en = messages.meet.call;
  const vn = vi_messages.meet.call;
  for (const key of [
    'ask_mira',
    'ask_summarize',
    'ask_decisions',
    'ask_actions',
  ] as const) {
    expect(vn[key]).toBeTruthy();
    expect(vn[key]).not.toBe(en[key]);
  }
});
