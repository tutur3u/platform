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
  const tree = (next: CallState) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>
          <CallClock
            meetingId="5e5217de-9bb3-4e20-8d99-526ad3e7e34f"
            state={next}
          />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree(state));
  return { ...view, update: (next: CallState) => view.rerender(tree(next)) };
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
    const chip = screen.getByTitle('05:00 left');
    expect(chip.textContent).toBe('Timer: 05:00');
    expect(chip.getAttribute('aria-live')).toBeNull();
    // A timer already running on join is not re-announced.
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: /Timer/ })).toBeNull();
    expect(container.querySelector('audio, video')).toBeNull();
    cleanup();
  }
});

it('announces each timer change in one always-mounted polite status', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  const idle = { ...running('host'), classTimer: null };
  const view = renderClock(idle);
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toBe('');
  expect(screen.queryByTitle('05:00 left')).toBeNull();
  view.update(running('host'));
  expect(screen.getByRole('status')).toBe(status);
  expect(status.textContent).toBe('Timer started');
  view.update({
    ...running('host'),
    classTimer: { ...running('host').classTimer!, status: 'paused' },
  });
  expect(status.textContent).toBe('Timer paused');
  view.update({
    ...running('host'),
    classTimer: {
      ...running('host').classTimer!,
      status: 'ended',
      remainingMs: 0,
      endsAt: undefined,
    },
  });
  expect(status.textContent).toBe("Time's up");
  expect(screen.getByTitle("Time's up").className).toContain(
    'motion-safe:animate-pulse'
  );
  expect(view.container.querySelector('audio, video')).toBeNull();
  view.update(idle);
  expect(status.textContent).toBe('Timer stopped');
  expect(screen.getAllByRole('status')).toHaveLength(1);
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
  expect(screen.queryByTitle('05:00 left')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('');
  expect(screen.queryByRole('button', { name: 'Attendance' })).toBeNull();
});
