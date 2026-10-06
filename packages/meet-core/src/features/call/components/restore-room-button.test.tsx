// @vitest-environment jsdom
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
import { isKnownEndedRoom, rememberEndedRoom } from '../lib/ended-room-cache';
import { RestoreRoomButton } from './restore-room-button';

const mocks = vi.hoisted(() => ({ state: vi.fn(), restore: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetCallRoomState: mocks.state,
  restoreMeetCallRoom: mocks.restore,
}));
const meetingId = '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function view(accountId: string, onRestored: () => void) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <RestoreRoomButton
        accountId={accountId}
        meetingId={meetingId}
        onRestored={onRestored}
      />
    </NextIntlClientProvider>
  );
}
it('restores with fresh lifecycle CAS and captured actor, clearing only its actor hint', async () => {
  rememberEndedRoom('account-a', meetingId);
  rememberEndedRoom('account-b', meetingId);
  mocks.state.mockResolvedValue({ ended: true, lifecycleVersion: 17 });
  mocks.restore.mockResolvedValue({ ended: false });
  const restored = vi.fn();
  render(view('account-a', restored));
  fireEvent.click(screen.getByRole('button', { name: 'Restore meeting' }));
  await waitFor(() => expect(restored).toHaveBeenCalledOnce());
  expect(mocks.restore).toHaveBeenCalledWith(meetingId, 17, 'account-a');
  expect(isKnownEndedRoom('account-a', meetingId)).toBe(false);
  expect(isKnownEndedRoom('account-b', meetingId)).toBe(true);
});
it('does not mutate after delayed lookup crosses actor ABA', async () => {
  const old = deferred<{ ended: boolean; lifecycleVersion: number }>();
  mocks.state.mockReturnValue(old.promise);
  const restored = vi.fn();
  const ui = render(view('account-a', restored));
  fireEvent.click(screen.getByRole('button', { name: 'Restore meeting' }));
  ui.rerender(view('account-b', restored));
  ui.rerender(view('account-a', restored));
  await act(async () => {
    old.resolve({ ended: true, lifecycleVersion: 1 });
    await old.promise;
  });
  expect(mocks.restore).not.toHaveBeenCalled();
  expect(restored).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole('button', { name: 'Restore meeting' })
      .hasAttribute('disabled')
  ).toBe(false);
});
it('late mutation completion cannot clear a new pending attempt or actor hints', async () => {
  const old = deferred<unknown>();
  const next = deferred<unknown>();
  mocks.state.mockResolvedValue({ ended: true, lifecycleVersion: 3 });
  mocks.restore
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  rememberEndedRoom('account-a', meetingId);
  const restored = vi.fn();
  const ui = render(view('account-a', restored));
  fireEvent.click(screen.getByRole('button', { name: 'Restore meeting' }));
  await waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
  ui.rerender(view('account-b', restored));
  ui.rerender(view('account-a', restored));
  fireEvent.click(screen.getByRole('button', { name: 'Restore meeting' }));
  await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(2));
  await act(async () => {
    old.resolve({});
    await old.promise;
  });
  expect(restored).not.toHaveBeenCalled();
  expect(isKnownEndedRoom('account-a', meetingId)).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Restoring meeting…' })
      .hasAttribute('disabled')
  ).toBe(true);
  await act(async () => {
    next.resolve({});
    await next.promise;
  });
  await waitFor(() => expect(restored).toHaveBeenCalledOnce());
});
it('failure retains ended hints and exposes a retryable error', async () => {
  mocks.state.mockResolvedValue({ ended: true, lifecycleVersion: 2 });
  mocks.restore.mockRejectedValue(new Error('CAS conflict'));
  rememberEndedRoom('account-a', meetingId);
  const restored = vi.fn();
  render(view('account-a', restored));
  fireEvent.click(screen.getByRole('button', { name: 'Restore meeting' }));
  await screen.findByRole('alert');
  expect(restored).not.toHaveBeenCalled();
  expect(isKnownEndedRoom('account-a', meetingId)).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Restore meeting' })
      .hasAttribute('disabled')
  ).toBe(false);
});
it('unmount fences delayed restoration completion', async () => {
  const result = deferred<unknown>();
  mocks.state.mockResolvedValue({ ended: true, lifecycleVersion: 2 });
  mocks.restore.mockReturnValue(result.promise);
  const restored = vi.fn();
  const ui = render(view('account-a', restored));
  fireEvent.click(screen.getByRole('button', { name: 'Restore meeting' }));
  await waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
  ui.unmount();
  await act(async () => {
    result.resolve({});
    await result.promise;
  });
  expect(restored).not.toHaveBeenCalled();
});
