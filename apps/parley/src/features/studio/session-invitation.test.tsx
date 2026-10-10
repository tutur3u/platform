// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { SessionInvitation } from './session-invitation';

const f = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: f }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionInvitation roomCode="example-room-code" />
    </NextIntlClientProvider>
  );
  return writeText;
}
it('shares the Parley room on the current origin, never the private review URL', async () => {
  const writeText = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' }));
  await waitFor(() => expect(f.success).toHaveBeenCalled());
  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}/r/example-room-code`
  );
  fireEvent.click(screen.getByRole('button', { name: 'Copy room code' }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith('example-room-code')
  );
});
it('leaves a selectable code when clipboard access fails', async () => {
  setup(vi.fn().mockRejectedValue(new Error('denied')));
  fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' }));
  await waitFor(() => expect(f.error).toHaveBeenCalled());
  const input = screen.getByRole('textbox', {
    name: 'Room code',
  }) as HTMLInputElement;
  expect(input.value).toBe('example-room-code');
  expect(input.readOnly).toBe(true);
  expect(
    (
      screen.getByRole('button', {
        name: 'Copy invitation link',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});
