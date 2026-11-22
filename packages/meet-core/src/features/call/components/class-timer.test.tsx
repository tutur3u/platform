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
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { type CallState, INITIAL_CALL_STATE } from '../lib/call-state';
import { canStartClassTimer, ClassTimerControls } from './class-timer';

const command = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  commandMeetClassTimer: command,
}));

afterEach(() => {
  cleanup();
  command.mockClear();
  vi.useRealTimers();
});

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const NOW = '2026-09-15T10:00:00.000Z';

function running(role: CallState['classRole']): CallState {
  return {
    ...INITIAL_CALL_STATE,
    classRole: role,
    classTimerEnabled: true,
    classTimerServerNow: NOW,
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

function renderControls(state: CallState) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ClassTimerControls meetingId={meetingId} state={state} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('names the room timer Timer in both languages', () => {
  expect(messages.meet.call.class_timer).toBe('Timer');
  expect(viMessages.meet.call.class_timer).toBe('Hẹn giờ');
});

it('lets the host start, pause and stop the room timer', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  renderControls(running('host'));
  expect(screen.getByTitle('05:00 left')).toBeTruthy();
  // The page chip is not a live region; the header announces state.
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '1 min' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  fireEvent.change(screen.getByLabelText('Minutes'), {
    target: { value: '20' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(command).toHaveBeenCalledWith(meetingId, {
    action: 'start',
    durationMs: 60_000,
  });
  expect(command).toHaveBeenCalledWith(meetingId, {
    action: 'pause',
    durationMs: undefined,
  });
  expect(command).toHaveBeenCalledWith(meetingId, {
    action: 'start',
    durationMs: 1_200_000,
  });
});

it('lets a co-host start but not pause or stop', () => {
  renderControls(running('cohost'));
  expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  expect(
    (screen.getByRole('button', { name: '5 min' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
});

it('offers the timer only to hosts and co-hosts while the room enables it', () => {
  expect(canStartClassTimer(running('host'))).toBe(true);
  expect(canStartClassTimer(running('cohost'))).toBe(true);
  expect(canStartClassTimer(running('participant'))).toBe(false);
  expect(
    canStartClassTimer({ ...running('host'), classTimerEnabled: false })
  ).toBe(false);
});
