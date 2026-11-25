// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { type CallState, INITIAL_CALL_STATE } from '../lib/call-state';
import { timerStore } from '../tools/timers/timer-store';
import {
  defaultTimerMode,
  everyoneBlockedReason,
  TimerModes,
} from './timer-modes';

const command = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  commandMeetClassTimer: command,
}));

afterEach(() => {
  cleanup();
  command.mockClear();
  timerStore.reset();
});

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const call = messages.meet.call;
const personal = call.tools.timer;

const room = (
  classRole: CallState['classRole'],
  classTimerEnabled = true
): CallState => ({ ...INITIAL_CALL_STATE, classRole, classTimerEnabled });

function renderModes(state: CallState) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimerModes room={{ meetingId, state }} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const mode = (name: string) => screen.getByRole('radio', { name });
const checked = (name: string) =>
  mode(name).getAttribute('aria-checked') === 'true';

it('names both modes in both languages', () => {
  expect(call.class_timer_mode_me).toBe('Just me');
  expect(call.class_timer_mode_everyone).toBe('Everyone');
  expect(viMessages.meet.call.class_timer_mode_me).toBe('Chỉ mình tôi');
  expect(viMessages.meet.call.class_timer_mode_everyone).toBe('Mọi người');
});

it('starts hosts and co-hosts on Everyone and others on Just me', () => {
  expect(defaultTimerMode(room('host'))).toBe('everyone');
  expect(defaultTimerMode(room('cohost'))).toBe('everyone');
  expect(defaultTimerMode(room('participant'))).toBe('me');
  expect(defaultTimerMode(room('host', false))).toBe('me');
});

it('sets the room timer for everyone from the host default', async () => {
  renderModes(room('host'));
  expect(checked(call.class_timer_mode_everyone)).toBe(true);
  fireEvent.click(
    screen.getByRole('button', {
      name: call.class_timer_preset.replace('{minutes}', '5'),
    })
  );
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(meetingId, {
      action: 'start',
      durationMs: 300_000,
    })
  );
});

it('runs Just me on this device without writing room state', async () => {
  renderModes(room('host'));
  fireEvent.click(mode(call.class_timer_mode_me));
  expect(checked(call.class_timer_mode_me)).toBe(true);
  expect(screen.getByRole('group', { name: personal.presets })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: personal.start }));
  expect(timerStore.get().endsAt).not.toBeNull();
  await act(async () => {
    await Promise.resolve();
  });
  expect(command).not.toHaveBeenCalled();
});

it('disables Everyone with the reason for people who cannot set it', () => {
  renderModes(room('participant'));
  const everyone = mode(call.class_timer_mode_everyone);
  expect(everyone.hasAttribute('disabled')).toBe(true);
  expect(checked(call.class_timer_mode_me)).toBe(true);
  const reason = screen.getByText(call.class_timer_everyone_role);
  expect(everyone.getAttribute('aria-describedby')).toBe(reason.id);
  expect(screen.queryByLabelText(call.class_timer_minutes)).toBeNull();
});

it('explains a room without a shared timer', () => {
  expect(everyoneBlockedReason(room('host', false))).toBe(
    'class_timer_everyone_off'
  );
  expect(everyoneBlockedReason(room('participant'))).toBe(
    'class_timer_everyone_role'
  );
  expect(everyoneBlockedReason(room('cohost'))).toBeNull();
  renderModes(room('host', false));
  expect(screen.getByText(call.class_timer_everyone_off)).toBeTruthy();
});
