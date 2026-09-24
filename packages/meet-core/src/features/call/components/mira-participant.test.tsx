// @vitest-environment jsdom
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
import { MiraParticipant } from './mira-participant';

vi.mock('./mira-profile', () => ({ MiraAvatar: () => <span /> }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('shows an AI participant with speaking feedback, pinning and the shared chat entrypoint', () => {
  vi.useFakeTimers();
  const onFocus = vi.fn(),
    onChat = vi.fn();
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <MiraParticipant
        sessionId="live"
        focused={false}
        onFocus={onFocus}
        onChat={onChat}
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByText(messages.meet.live.ai_participant)).toBeTruthy();
  act(() => {
    window.dispatchEvent(
      new CustomEvent('meet:assistant-audio', {
        detail: { message: { type: 'assistant.audio', sessionId: 'live' } },
      })
    );
  });
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.live.speaking
  );
  act(() => vi.advanceTimersByTime(1200));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.live.ready_for_you
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.pin_mira })
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.ask_in_chat })
  );
  expect(onFocus).toHaveBeenCalledOnce();
  expect(onChat).toHaveBeenCalledOnce();
});
