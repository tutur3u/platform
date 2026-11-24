// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MEET_ASSISTANT_USER_ID } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ ask: vi.fn(), audience: vi.fn() }));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: f.audience,
  updateMiraAudienceAttestation: vi.fn(),
}));
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
const adults = messages.meet.mira_adults;
beforeEach(() => {
  f.ask.mockReset();
  f.audience.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function showChat(overrides?: Partial<ComponentProps<typeof ChatPanel>>) {
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
          {...overrides}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return onSendChat;
}

function ask(body: string, onOpenPrivateMira?: () => void) {
  const sent = showChat({ onOpenPrivateMira });
  fireEvent.change(screen.getByRole('textbox', { name: call.chat }), {
    target: { value: body },
  });
  fireEvent.click(screen.getByRole('button', { name: call.send }));
  return sent;
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

it('lets the user open Private Mira from the room denial without resending the message', async () => {
  f.ask.mockRejectedValue(
    Object.assign(new Error('Room unavailable'), { status: 403 })
  );
  const openPrivate = vi.fn();
  const send = ask('@mira summarize', openPrivate);
  fireEvent.click(
    await screen.findByRole('button', { name: call.personal_chat })
  );
  expect(openPrivate).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledOnce();
  expect(f.ask).toHaveBeenCalledOnce();
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

it('shows no 18+ badge in chat and states the rule only while a message mentions Mira', () => {
  showChat();
  expect(screen.queryByText(adults.notice, { ignore: '.sr-only' })).toBeNull();
  expect(screen.queryByText('18+')).toBeNull();
  const askMira = screen.getByRole('button', { name: call.ask_mira });
  expect(askMira.textContent).not.toContain('18+');
  expect(askMira.getAttribute('aria-describedby')).toBeNull();
  const composer = screen.getByRole('textbox', { name: call.chat });
  expect(composer.getAttribute('aria-describedby')).toBeNull();
  fireEvent.change(composer, { target: { value: '@mira summarize' } });
  expect(
    screen.getAllByText(adults.notice, { ignore: '.sr-only' })
  ).toHaveLength(1);
  expect(
    document.getElementById(composer.getAttribute('aria-describedby') ?? '')
      ?.textContent
  ).toBe(adults.notice);
  fireEvent.change(composer, { target: { value: 'hello everyone' } });
  expect(screen.queryByText(adults.notice, { ignore: '.sr-only' })).toBeNull();
});

it('keeps the room Mira chip and the where-Mira strip out of the chat', () => {
  showChat({
    mira: {
      activity: { polls: { active: true, status: 'Drafting' } },
    },
  });
  expect(
    screen.queryByRole('button', { name: /^Mira is on, turned on by/ })
  ).toBeNull();
  expect(screen.queryByRole('region', { name: 'Where Mira is' })).toBeNull();
});

const miraLine = (id: string, revision?: number) => ({
  id,
  userId: MEET_ASSISTANT_USER_ID,
  assistant: true,
  body: 'Mira is on, turned on by Lan.',
  displayName: 'Mira',
  createdAt: `2026-01-01T10:00:0${id.length}Z`,
  notice: { kind: 'mira.on' as const, by: 'Lan', revision },
});

it('shows one Mira is on line per acceptance revision and lets it be dismissed for the meeting', () => {
  sessionStorage.clear();
  const line = messages.meet.mira_consent;
  const chat = [miraLine('a', 3), miraLine('bb', 3)];
  showChat({ chat });
  const lines = screen.getAllByText(line.indicator_on.replace('{name}', 'Lan'));
  expect(lines).toHaveLength(1);
  // The system line is not a Mira chat message: no Chat pill, no profile.
  expect(screen.queryByText('Chat')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: line.dismiss_line }));
  expect(
    screen.queryByText(line.indicator_on.replace('{name}', 'Lan'))
  ).toBeNull();
  cleanup();
  // Dismissed for this meeting in this tab, so a remount keeps it hidden.
  showChat({ chat });
  expect(
    screen.queryByText(line.indicator_on.replace('{name}', 'Lan'))
  ).toBeNull();
  cleanup();
  // A later acceptance is a new revision and shows again.
  showChat({ chat: [...chat, miraLine('ccc', 4)] });
  expect(
    screen.getAllByText(line.indicator_on.replace('{name}', 'Lan'))
  ).toHaveLength(1);
});

it('still shows the line when session storage is blocked', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  showChat({ chat: [miraLine('a', 7)] });
  const text = messages.meet.mira_consent.indicator_on.replace('{name}', 'Lan');
  expect(screen.getByText(text)).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', {
      name: messages.meet.mira_consent.dismiss_line,
    })
  );
  expect(screen.queryByText(text)).toBeNull();
  get.mockRestore();
  set.mockRestore();
});

it('names the workspace 18+ setting, not a generic refusal, when @mira is off for the workspace', async () => {
  f.ask.mockRejectedValue(
    Object.assign(new Error('Room Mira needs the workspace 18+ setting'), {
      status: 403,
      code: 'MIRA_WORKSPACE_UNAVAILABLE',
    })
  );
  f.audience.mockRejectedValue(
    Object.assign(new Error('Denied'), { status: 403 })
  );
  const openPrivate = vi.fn();
  showChat({ onOpenPrivateMira: openPrivate, wsId: 'synthetic-workspace' });
  fireEvent.change(screen.getByRole('textbox', { name: call.chat }), {
    target: { value: '@mira summarize' },
  });
  fireEvent.click(screen.getByRole('button', { name: call.send }));
  const alert = await screen.findByRole('alert');
  await waitFor(() => expect(alert.textContent).toContain(adults.ask_owner));
  expect(alert.textContent).toContain(adults.workspace_off);
  expect(alert.textContent).not.toContain(call.assistant_private_only);
  // Private Mira needs the same setting, so it is not offered as a way out.
  expect(screen.queryByRole('button', { name: call.personal_chat })).toBeNull();
  expect(f.audience).not.toHaveBeenCalled();
  expect(
    assistantFailureNotice({ status: 403, code: 'MIRA_WORKSPACE_UNAVAILABLE' })
  ).toBe('workspace_off');
});
