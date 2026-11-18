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
import { MiraParticipant, type MiraParticipantState } from './mira-participant';

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
  expect(screen.getByText(messages.meet.live.tile_footer)).toBeTruthy();
  act(() => {
    window.dispatchEvent(
      new CustomEvent('meet:assistant-audio', {
        detail: { message: { type: 'assistant.audio', sessionId: 'live' } },
      })
    );
  });
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.live.tile_speaking_status
  );
  act(() => vi.advanceTimersByTime(1200));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.live.tile_listening_status
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.pin_mira })
  );
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.tile_open_chat })
  );
  expect(onFocus).toHaveBeenCalledOnce();
  expect(onChat).toHaveBeenCalledOnce();
});

it.each([
  ['listening', 'Mira • Live', 'Listening'],
  ['speaking', 'Mira • Live', 'Speaking'],
  ['chat', 'Mira • Chat', 'Typing in Room Chat'],
] satisfies [MiraParticipantState, string, string][])(
  'renders the %s tile with a caption and no required animation',
  (state, label, status) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <MiraParticipant
          sessionId="live"
          focused
          state={state}
          caption="Current response preview"
          onFocus={vi.fn()}
          onChat={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(status);
    expect(screen.getByText('Current response preview')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Pin Mira' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      container.querySelectorAll('[class*="motion-reduce:animate-none"]').length
    ).toBeGreaterThanOrEqual(state === 'chat' ? 0 : 3);
  }
);
