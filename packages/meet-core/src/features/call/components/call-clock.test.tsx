// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
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

function renderClock(state: CallState, command = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>
          <CallClock
            meetingId="5e5217de-9bb3-4e20-8d99-526ad3e7e34f"
            room={{ commandClassTimer: command }}
            state={state}
          />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { ...view, command };
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

it('shows a synced countdown, phone-width controls, and no autoplay media', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  const { command, container } = renderClock(running('host'));
  expect(screen.getByRole('status').textContent).toContain('05:00 left');
  expect(container.querySelector('audio, video')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Class timer' }));
  expect(document.body.innerHTML).toContain('w-[min(18rem,calc(100vw-2rem))]');
  expect(document.body.innerHTML).toContain('grid-cols-2');
  fireEvent.click(screen.getByRole('button', { name: '1 min' }));
  expect(command).toHaveBeenCalledWith('start', 60_000);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(command).toHaveBeenCalledWith('pause');
});

it('hides pause, resume, and stop from a co-host and shows the end cue without sound', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  const { command, container } = renderClock(running('cohost'));
  fireEvent.click(screen.getByRole('button', { name: 'Class timer' }));
  expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  expect(
    (screen.getByRole('button', { name: '5 min' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  cleanup();
  renderClock({
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
  expect(command).not.toHaveBeenCalled();
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

it('hides the class timer and attendance while the server switches are off', () => {
  renderClock({
    ...running('host'),
    classAttendanceEnabled: false,
    classTimerEnabled: false,
  });
  expect(screen.queryByRole('button', { name: 'Class timer' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Attendance' })).toBeNull();
});
