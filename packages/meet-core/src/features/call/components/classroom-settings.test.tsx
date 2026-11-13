// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import { ClassroomSettings } from './classroom-settings';
afterEach(cleanup);
function view(options: { role: 'host' | 'speaker'; cap?: number }) {
  const updateSettings = vi.fn();
  const room = {
    state: {
      ...INITIAL_CALL_STATE,
      role: options.role,
      maxParticipants: options.cap,
    },
    updateSettings,
  };
  const output = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ClassroomSettings room={room} />
    </NextIntlClientProvider>
  );
  return { updateSettings, ...output };
}
it('hides cap controls without signed capability', () => {
  const r = view({ role: 'host' });
  expect(r.container.textContent).toBe('');
});
it('hides cap controls from participants', () => {
  const r = view({ role: 'speaker', cap: 50 });
  expect(r.container.textContent).toBe('');
});
it('renders plan maximum and sends bounded host changes', () => {
  const r = view({ role: 'host', cap: 50 });
  const input = screen.getByLabelText(en.meet.call.room_maximum);
  expect(input.getAttribute('max')).toBe('50');
  fireEvent.change(input, { target: { value: '20' } });
  fireEvent.blur(input);
  expect(r.updateSettings).toHaveBeenCalledWith({ maxParticipants: 20 });
});
it('does not send a client limit above the plan cap', () => {
  const r = view({ role: 'host', cap: 10 });
  const input = screen.getByLabelText(en.meet.call.room_maximum);
  fireEvent.change(input, { target: { value: '100' } });
  fireEvent.blur(input);
  expect(r.updateSettings).not.toHaveBeenCalled();
});
it('exposes explicit stop-admission and sends the host setting', () => {
  const r = view({ role: 'host', cap: 50 });
  fireEvent.click(
    screen.getByRole('switch', { name: en.meet.call.stop_admission })
  );
  expect(r.updateSettings).toHaveBeenCalledWith({ admissionClosed: true });
});
