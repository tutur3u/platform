// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import enMessages from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';

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

import { ChatPanel } from './chat-panel';

afterEach(cleanup);

function show(locale: 'en' | 'vi', qaLive?: boolean) {
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

it('points questions to the Q&A while it is open', () => {
  show('en', true);
  expect(placeholder()).toBe('Message everyone · questions go to Q&A');
});

it('has the same placeholders in Vietnamese', () => {
  show('vi', true);
  expect(placeholder()).toBe(viMessages.meet.call.chat_placeholder_qa);
  cleanup();
  show('vi');
  expect(placeholder()).toBe(viMessages.meet.call.chat_placeholder);
});
