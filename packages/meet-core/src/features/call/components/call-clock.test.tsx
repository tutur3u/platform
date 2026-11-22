// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { INITIAL_CALL_STATE, type CallState } from '../lib/call-state';
import { CallClock } from './call-clock';

vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  getMeetAttendance: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('./meeting-local-time', () => ({
  useMeetingTimeZone: () => 'Asia/Ho_Chi_Minh',
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderClock(state: CallState) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>
          <CallClock
            meetingId="5e5217de-9bb3-4e20-8d99-526ad3e7e34f"
            state={state}
          />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return view;
}

const NOW = '2026-09-15T10:00:00.000Z';

function running(role: CallState['classRole']): CallState {
  return {
    ...INITIAL_CALL_STATE,
    classRole: role,
    classAttendanceEnabled: true,
    classTimerEnabled: true,
    classTimerServerNow: NOW,
    role: role === 'host' ? 'host' : 'speaker',
    classTimer: {
      id: 'timer',
      status: 'running',
      durationMs: 300_000,
      remainingMs: 300_000,
      endsAt: '2026-09-15T10:05:00.000Z',
      updatedAt: NOW,
    },
  };
}

it('shows everyone a read-only synced timer chip in the top bar', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  for (const role of ['host', 'participant'] as const) {
    const { container } = renderClock(running(role));
    const chip = screen.getByRole('status', { name: /^Timer: 05:00 left$/ });
    expect(chip.textContent).toBe('05:00');
    expect(screen.queryByRole('button', { name: /Timer/ })).toBeNull();
    expect(container.querySelector('audio, video')).toBeNull();
    cleanup();
  }
});

it('shows the end cue without sound and no chip without a timer', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  const { container } = renderClock({
    ...running('host'),
    classTimer: {
      ...running('host').classTimer!,
      status: 'ended',
      remainingMs: 0,
      endsAt: undefined,
    },
  });
  expect(screen.getByRole('status').textContent).toContain("Time's up");
  expect(screen.getByRole('status').className).toContain(
    'motion-safe:animate-pulse'
  );
  expect(container.querySelector('audio, video')).toBeNull();
  cleanup();
  renderClock({ ...running('host'), classTimer: null });
  expect(screen.queryByRole('status')).toBeNull();
});

it('offers attendance only to the host and a co-host', () => {
  renderClock({
    ...INITIAL_CALL_STATE,
    classRole: 'participant',
    classAttendanceEnabled: true,
  });
  expect(screen.queryByRole('button', { name: 'Attendance' })).toBeNull();
  cleanup();
  renderClock({
    ...INITIAL_CALL_STATE,
    classRole: 'cohost',
    classAttendanceEnabled: true,
  });
  expect(
    (screen.getByRole('button', { name: 'Attendance' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
});

it('hides the timer and attendance while the server switches are off', () => {
  renderClock({
    ...running('host'),
    classAttendanceEnabled: false,
    classTimerEnabled: false,
  });
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Attendance' })).toBeNull();
});
