// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import enMessages from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import { ChatPanel } from './chat-panel';

vi.mock('@tuturuuu/internal-api', () => ({
  listMeetAssistantReviews: vi.fn(async () => []),
  readMeetChatFile: vi.fn(),
  readRoomMiraConsent: vi.fn(async () => ({ available: false })),
  setRoomMiraChoice: vi.fn(),
  uploadMeetChatFile: vi.fn(),
}));
vi.mock('./mira-profile', () => ({
  MiraAvatar: () => null,
  MiraModeTag: () => null,
  MiraLiveDot: () => null,
}));
vi.mock('../prejoin/use-meet-call-ux', () => ({
  useMeetCallUx: vi.fn(),
}));

afterEach(cleanup);

function show(locale: 'en' | 'vi', qaLive = false, meetUxV2 = true) {
  vi.mocked(useMeetCallUx).mockReturnValue(meetUxV2);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? enMessages : viMessages}
      >
        <ChatPanel
          chat={[]}
          onSendChat={vi.fn()}
          selfUserId="user"
          accountId="account"
          meetingId="room"
          qaLive={qaLive}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const placeholder = () =>
  screen.getByRole('textbox').getAttribute('placeholder');

it('keeps a short placeholder while no Q&A is open', () => {
  show('en');
  expect(placeholder()).toBe(enMessages.meet.call.chat_placeholder);
  expect(placeholder()?.length).toBeLessThan(45);
});

it('asks only for a message, and the Ask Mira button teaches the rest', () => {
  show('en');
  expect(placeholder()).toBe('Message everyone');
  cleanup();
  show('vi');
  expect(placeholder()).toBe('Nhắn cho mọi người');
});

it('points questions to the Q&A while it is open', () => {
  show('en', true);
  expect(placeholder()).toBe(enMessages.meet.call.chat_placeholder_qa_v2);
});

it('has the same placeholders in Vietnamese', () => {
  show('vi', true);
  expect(placeholder()).toBe(viMessages.meet.call.chat_placeholder_qa_v2);
  cleanup();
  show('vi');
  expect(placeholder()).toBe(viMessages.meet.call.chat_placeholder);
});

it('preserves the original composer when Meet UX V2 is off', () => {
  const call = enMessages.meet.call;
  show('en', true, false);
  expect(placeholder()).toBe('Message everyone · questions go to Q&A');
  const input = screen.getByRole('textbox', { name: call.chat });
  expect(input.parentElement?.classList.contains('@container')).toBe(true);
  expect(input.parentElement?.classList.contains('items-end')).toBe(true);
  const mira = screen.getByRole('button', { name: call.ask_mira });
  expect(mira.textContent).toBe(call.ask_mira);
  for (const name of [call.attach_files, call.ask_mira, call.send]) {
    const button = screen.getByRole('button', { name });
    expect(button.classList.contains('self-end')).toBe(false);
  }
});
