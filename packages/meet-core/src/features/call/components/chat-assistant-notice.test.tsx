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

it('states the 18+ rule where room chat offers @mira and while a message mentions it', () => {
  showChat();
  // The empty chat invites people to ask Mira, so it carries the rule.
  expect(screen.getAllByText(adults.notice)).toHaveLength(1);
  const composer = screen.getByRole('textbox', { name: call.chat });
  expect(composer.getAttribute('aria-describedby')).toBeNull();
  fireEvent.change(composer, { target: { value: '@mira summarize' } });
  expect(screen.getAllByText(adults.notice)).toHaveLength(2);
  expect(
    document.getElementById(composer.getAttribute('aria-describedby') ?? '')
      ?.textContent
  ).toBe(adults.notice);
  fireEvent.change(composer, { target: { value: 'hello everyone' } });
  expect(screen.getAllByText(adults.notice)).toHaveLength(1);
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
  expect(f.audience).toHaveBeenCalledWith('synthetic-workspace');
  expect(
    assistantFailureNotice({ status: 403, code: 'MIRA_WORKSPACE_UNAVAILABLE' })
  ).toBe('workspace_off');
});

it('inserts a slash command by keyboard and sends through the normal Room Mira mention flow', async () => {
  const sent = showChat();
  const composer = screen.getByRole('textbox', { name: call.chat });
  fireEvent.change(composer, { target: { value: '/' } });
  const palette = screen.getByRole('listbox');
  expect(within(palette).getAllByRole('option')).toHaveLength(4);
  expect(sent).not.toHaveBeenCalled();
  expect(f.ask).not.toHaveBeenCalled();
  fireEvent.keyDown(composer, { key: 'ArrowDown' });
  const summary = within(palette).getByRole('option', { name: /^\/summary/ });
  expect(summary.getAttribute('aria-selected')).toBe('true');
  expect(composer.getAttribute('aria-activedescendant')).toBe(summary.id);
  fireEvent.keyDown(composer, { key: 'Enter' });
  expect((composer as HTMLTextAreaElement).value).toBe(
    '@Tuturuuu Summarize this conversation.'
  );
  expect(sent).not.toHaveBeenCalled();
  fireEvent.keyDown(composer, { key: 'Enter' });
  await waitFor(() =>
    expect(sent).toHaveBeenCalledWith(
      '@Tuturuuu Summarize this conversation.',
      []
    )
  );
  expect(f.ask).toHaveBeenCalledOnce();
});

it('dismisses the palette and opens filtered commands on further typing', () => {
  const sent = showChat();
  const composer = screen.getByRole('textbox', { name: call.chat });
  fireEvent.change(composer, { target: { value: '/' } });
  fireEvent.keyDown(composer, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(composer, { target: { value: '/re' } });
  const option = screen.getByRole('option');
  expect(option.textContent).toContain('/review');
  fireEvent.click(option);
  expect((composer as HTMLTextAreaElement).value).toBe(
    '@Tuturuuu Review the following:'
  );
  expect(sent).not.toHaveBeenCalled();
  expect(f.ask).not.toHaveBeenCalled();
});

it('renders action cards only for trusted Mira messages and dispatches authorized actions', async () => {
  const onAuthorizedAction = vi.fn(async () => undefined);
  const onFocusSurface = vi.fn();
  const chat = [
    {
      id: 'mira',
      userId: MEET_ASSISTANT_USER_ID,
      assistant: true,
      body: 'Review these updates',
      displayName: 'Mira',
      createdAt: '2026-01-01T10:00:00Z',
    },
    {
      id: 'person',
      userId: 'other',
      assistant: true,
      body: 'A regular chat message',
      displayName: 'Mira',
      createdAt: '2026-01-01T10:00:00Z',
    },
  ];
  showChat({
    chat,
    mira: {
      typing: true,
      onFocusSurface,
      toolsByMessageId: new Map([
        [
          'mira',
          [
            {
              tool: {
                id: 'p',
                title: 'Draft poll',
                status: 'proposed',
                scope: { kind: 'suggest' },
              },
              onAuthorizedAction,
            },
            {
              tool: {
                id: 'r',
                title: 'Append to rubric',
                status: 'running',
                scope: { kind: 'surface', surface: 'docs' },
              },
              onAuthorizedAction,
            },
            {
              tool: {
                id: 'a',
                title: 'Edit page',
                status: 'applied',
                scope: { kind: 'surface', surface: 'docs' },
                attribution: 'live',
              },
              onAuthorizedAction,
            },
            {
              tool: {
                id: 's',
                title: 'Check code',
                status: 'stopped',
                scope: { kind: 'suggest' },
              },
              onAuthorizedAction,
            },
            {
              tool: {
                id: 'u',
                title: 'Draft actions',
                status: 'undone',
                scope: { kind: 'suggest' },
              },
              onAuthorizedAction,
            },
            {
              tool: {
                id: 'view',
                title: 'View only',
                status: 'running',
                scope: { kind: 'suggest' },
              },
            },
          ],
        ],
        [
          'person',
          [
            {
              tool: {
                id: 'fake',
                title: 'Untrusted tool',
                status: 'applied',
                scope: { kind: 'suggest' },
              },
              onAuthorizedAction,
            },
          ],
        ],
      ]),
    },
  });
  expect(screen.getByText('Mira is typing…')).toBeTruthy();
  expect(screen.getByText('Mira • Chat')).toBeTruthy();
  expect(screen.getByText('Chat')).toBeTruthy();
  expect(screen.queryByText('Untrusted tool')).toBeNull();
  expect(screen.getByText('Edited by Mira (Voice Live)')).toBeTruthy();
  for (const name of ['Stopped', 'Undone'])
    expect(screen.getByText(name)).toBeTruthy();
  expect(
    within(screen.getByRole('region', { name: 'View only' })).queryByRole(
      'button'
    )
  ).toBeNull();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Append to rubric' })).getByRole(
      'button',
      { name: 'Docs' }
    )
  );
  expect(onFocusSurface).toHaveBeenCalledWith('docs');
  for (const name of ['Approve', 'Stop', 'Undo']) {
    fireEvent.click(screen.getByRole('button', { name }));
  }
  await waitFor(() =>
    expect(onAuthorizedAction.mock.calls).toEqual([
      ['approve'],
      ['stop'],
      ['undo'],
    ])
  );
});

it('maps the room consent fence separately from unavailable room Mira', () => {
  expect(
    assistantFailureNotice({ status: 409, code: 'MIRA_ROOM_CONSENT_REQUIRED' })
  ).toBe('consent_pending');
  expect(assistantFailureNotice({ status: 403 })).toBe('room_unavailable');
  expect(assistantFailureNotice({ status: 409 })).toBe('failed');
  expect(assistantFailureNotice(null)).toBe('failed');
  expect(call.assistant_consent_pending).toBeTruthy();
});
