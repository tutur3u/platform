// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { countdownState, RoomCountdown } from './room-countdown';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('clamps the ring and remaining time at the server deadline', () => {
  expect(countdownState(10_000, 0, 2500)).toEqual({
    remaining: 7500,
    fraction: 0.75,
  });
  expect(countdownState(10_000, 0, 12_000)).toEqual({
    remaining: 0,
    fraction: 0,
  });
  expect(countdownState(10_000, 0, -500)).toEqual({
    remaining: 10_500,
    fraction: 1,
  });
});
it('shows a compact countdown and exposes the localized deadline on click', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  const { container } = render(
    <NextIntlClientProvider
      locale="en"
      timeZone="Asia/Ho_Chi_Minh"
      messages={messages}
    >
      <TooltipProvider>
        <RoomCountdown expiresAt="2026-09-15T10:02:00Z" />
      </TooltipProvider>
    </NextIntlClientProvider>
  );
  const button = screen.getByRole('button', {
    name: 'View meeting time limit',
  });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  act(() => vi.advanceTimersByTime(90_000));
  expect(
    container
      .querySelector('[stroke-dashoffset]')
      ?.getAttribute('stroke-dashoffset')
  ).toBe('75');
  fireEvent.click(button);
  expect(screen.getByRole('dialog').textContent).toContain('30s remaining');
  expect(screen.getByRole('dialog').textContent).toMatch(/5:02|17:02/);
  expect(button.getAttribute('aria-label')).toBe('View meeting time limit');
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole('dialog').textContent).toContain(
    'Meeting time limit reached'
  );
});
