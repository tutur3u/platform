// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vietnamese from '../../../../../../apps/meet/messages/vi.json';
import {
  clearLiveSession,
  type LiveSessionSnapshot,
  publishLiveSession,
} from '../../live-assistant/live-session-store';

const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  askPersonalMeetAssistant: ask,
  readPrivateMiraPolicy: vi.fn(),
  setPrivateMiraChoice: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: vi.fn(),
  updateMiraAudienceAttestation: vi.fn(),
}));
vi.mock('./mira-profile', () => ({
  MiraProfile: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MiraAvatar: () => <span />,
}));
vi.mock('./chat-message-body', () => ({
  ChatMessageBody: ({ body }: { body: string }) => <p>{body}</p>,
}));

import { PersonalChat } from './personal-chat';

const assistant = messages.meet.call.miraEverywhere.tutor.assistant;
const permissions = messages.meet.call.miraEverywhere.permissions;
const live = messages.meet.live;
const adults = messages.meet.mira_adults;

afterEach(() => {
  cleanup();
  act(() => clearLiveSession());
  vi.clearAllMocks();
});

function session(overrides: Partial<LiveSessionSnapshot> = {}) {
  const controls = {
    start: vi.fn(async () => {}),
    send: vi.fn(),
    stop: vi.fn(async () => {}),
    decide: vi.fn(async () => {}),
    openConsent: vi.fn(),
  };
  const snapshot: LiveSessionSnapshot = {
    meetingId: 'room',
    accountId: 'actor',
    status: 'idle',
    mode: 'personal',
    transcript: [],
    reviews: [],
    error: undefined,
    accepted: true,
    audioSuppressed: false,
    meetingMicOn: false,
    controls,
    ...overrides,
  };
  act(() => publishLiveSession(snapshot));
  return controls;
}

function show(locale: 'en' | 'vi' = 'en') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? messages : vietnamese}
      >
        <PersonalChat meetingId="room" accountId="actor" onShare={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('opens on a calm empty state with one Talk action and no capability card', () => {
  session();
  show();
  expect(screen.getByText(assistant.empty)).toBeTruthy();
  expect(screen.getByText(assistant.orType)).toBeTruthy();
  expect(
    screen.getByRole('textbox', { name: messages.meet.call.personal_chat })
  ).toHaveProperty('placeholder', assistant.placeholder);
  expect(screen.queryByText(permissions.title)).toBeNull();
  expect(screen.queryByText(permissions.draft)).toBeNull();
  expect(screen.queryByText(adults.notice)).toBeNull();
});

it('keeps the capabilities, privacy paragraph and 18+ line behind the info button', () => {
  show();
  expect(screen.queryByText(permissions.title)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: assistant.info }));
  expect(screen.getByText(permissions.title)).toBeTruthy();
  expect(screen.getByText(permissions.host)).toBeTruthy();
  for (const label of [
    permissions.draft,
    permissions.editDocs,
    permissions.suggestCode,
    permissions.readPrivate,
  ])
    expect(screen.getByText(label)).toBeTruthy();
  expect(
    screen.getByText(
      `${live.private_mic_hint} ${messages.meet.call.miraEverywhere.tutor.privacyDetail}`
    )
  ).toBeTruthy();
  expect(screen.getByText(adults.notice)).toBeTruthy();
});

it('starts a confirmed Continue from Talk and asks for consent otherwise', () => {
  const ready = session();
  show();
  // The empty state's Talk and the composer's mic start the same session.
  expect(screen.getAllByRole('button', { name: assistant.talk })).toHaveLength(
    2
  );
  fireEvent.click(screen.getAllByRole('button', { name: assistant.talk })[0]!);
  expect(ready.start).toHaveBeenCalledOnce();
  cleanup();
  const pending = session({ accepted: false });
  show();
  fireEvent.click(screen.getAllByRole('button', { name: assistant.talk })[0]!);
  expect(pending.openConsent).toHaveBeenCalledOnce();
  expect(pending.start).not.toHaveBeenCalled();
});

it('offers no Talk without a published live session', () => {
  show();
  expect(screen.queryByRole('button', { name: assistant.talk })).toBeNull();
  expect(screen.getByText(assistant.empty)).toBeTruthy();
});

it('shows one inline Listening, Pause and Stop row while live', () => {
  const controls = session({ status: 'listening' });
  show();
  expect(screen.getByRole('status').textContent).toContain(
    live.state_listening
  );
  expect(screen.queryByRole('button', { name: assistant.talk })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: live.pause }));
  expect(controls.send).toHaveBeenCalledWith({ type: 'pause', paused: true });
  fireEvent.click(screen.getByRole('button', { name: live.stop }));
  expect(controls.stop).toHaveBeenCalledOnce();
});

it('resumes from a paused row and keeps pause locked while the meeting microphone is on', () => {
  const controls = session({ status: 'paused' });
  show();
  fireEvent.click(screen.getByRole('button', { name: live.resume }));
  expect(controls.send).toHaveBeenCalledWith({ type: 'pause', paused: false });
  cleanup();
  session({ status: 'listening', meetingMicOn: true });
  show();
  expect(
    (screen.getByRole('button', { name: live.pause }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});

it('sends typed text through the live session while it is ready', () => {
  const controls = session({ status: 'listening' });
  show();
  const box = screen.getByRole('textbox', {
    name: messages.meet.call.personal_chat,
  });
  fireEvent.change(box, { target: { value: 'Hello Mira' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(controls.send).toHaveBeenCalledWith({
    type: 'text',
    text: 'Hello Mira',
  });
  expect(ask).not.toHaveBeenCalled();
});

for (const locale of ['en', 'vi'] as const) {
  it(`shows localized unavailable feedback for a failed start in ${locale}`, () => {
    const controls = session({ error: 'service_unavailable' });
    show(locale);
    expect(screen.getByRole('alert').textContent).toBe(
      locale === 'en'
        ? 'Mira is temporarily unavailable. No assistant joined the meeting.'
        : 'Mira tạm thời không khả dụng. Chưa có trợ lý nào tham gia cuộc họp.'
    );
    expect(controls.start).not.toHaveBeenCalled();
  });
}
