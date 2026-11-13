// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
const f = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  readPrivateMiraPolicy: f.read,
  setPrivateMiraChoice: f.write,
}));
import { PrivateMiraNotice } from './private-notice';
const accepted = vi.fn();
const stop = vi.fn();
const leave = vi.fn();
const live = messages.meet.live;
beforeEach(() => {
  vi.resetAllMocks();
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.write.mockResolvedValue({});
  stop.mockResolvedValue(undefined);
  leave.mockResolvedValue(undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show({ connected = true }: { connected?: boolean } = {}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <PrivateMiraNotice
          meetingId="synthetic"
          connected={connected}
          onAccepted={accepted}
          onStop={stop}
          onLeave={leave}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
it('focuses Continue without sending a choice or admitting input until a server-confirmed click', async () => {
  show();
  const button = await screen.findByRole('button', {
    name: messages.meet.live.phase_continue,
  });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false)
  );
  expect(f.write).not.toHaveBeenCalled();
  expect(accepted).not.toHaveBeenCalled();
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: { choice: 'continue' },
  });
  fireEvent.click(button);
  await waitFor(() => expect(accepted).toHaveBeenCalledWith(true));
  expect(f.write).toHaveBeenCalledWith('synthetic', 'synthetic-v1', 'continue');
});
it('never admits input after a failed write and stops before persisting mute', async () => {
  show();
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: messages.meet.live.phase_continue,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  f.write.mockRejectedValueOnce(new Error('Synthetic failure'));
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.phase_continue })
  );
  await screen.findByRole('alert');
  expect(accepted).not.toHaveBeenCalled();
  f.write.mockImplementation(async () => {
    expect(stop).toHaveBeenCalled();
  });
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.phase_mute })
  );
  await waitFor(() => expect(accepted).toHaveBeenCalledWith(false));
});

async function enabledContinue() {
  const button = (await screen.findByRole('button', {
    name: live.phase_continue,
  })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}
it('names a missing meeting presence and retries the same choice to a confirmed admission', async () => {
  show();
  const button = await enabledContinue();
  f.write.mockRejectedValueOnce(
    Object.assign(new Error('Room action is unavailable'), { status: 403 })
  );
  fireEvent.click(button);
  expect((await screen.findByRole('alert')).textContent).toContain(
    live.choice_not_admitted
  );
  expect(accepted).not.toHaveBeenCalled();
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: { choice: 'continue' },
  });
  fireEvent.click(screen.getByRole('button', { name: live.retry }));
  await waitFor(() => expect(accepted).toHaveBeenCalledWith(true));
  expect(f.write).toHaveBeenLastCalledWith(
    'synthetic',
    'synthetic-v1',
    'continue'
  );
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    live.choice_continue_done
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
it('shows a reason instead of admitting when the server confirms no choice or an unavailable policy', async () => {
  show();
  fireEvent.click(await enabledContinue());
  expect((await screen.findByRole('alert')).textContent).toContain(
    live.choice_unconfirmed
  );
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: false,
    choice: { choice: 'continue' },
  });
  fireEvent.click(screen.getByRole('button', { name: live.retry }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      live.choice_unavailable
    )
  );
  expect(accepted).not.toHaveBeenCalled();
});
it('marks only the clicked choice as pending and blocks repeat clicks', async () => {
  show();
  const button = await enabledContinue();
  f.write.mockReturnValue(new Promise(() => undefined));
  fireEvent.click(button);
  await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
  const mute = screen.getByRole('button', { name: live.phase_mute });
  expect(mute.getAttribute('aria-busy')).toBe('false');
  expect((mute as HTMLButtonElement).disabled).toBe(true);
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(f.write).toHaveBeenCalledTimes(1);
});
it('explains a disconnected room instead of offering a choice the server would reject', async () => {
  show({ connected: false });
  expect((await screen.findByRole('alert')).textContent).toContain(
    live.choice_not_connected
  );
  for (const name of [live.phase_continue, live.phase_mute])
    expect(
      (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
    ).toBe(true);
  expect(f.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: live.phase_leave }));
  await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  expect(stop).toHaveBeenCalled();
  expect(f.write).not.toHaveBeenCalled();
});
it('leaves even when the leave choice cannot be stored', async () => {
  show();
  await enabledContinue();
  f.write.mockRejectedValue(new Error('Synthetic failure'));
  fireEvent.click(screen.getByRole('button', { name: live.phase_leave }));
  await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  expect(stop).toHaveBeenCalled();
  expect(accepted).toHaveBeenCalledWith(false);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps the notice, retention and legal link behind a named details button', async () => {
  show();
  await enabledContinue();
  expect(screen.queryByText(live.phase_notice)).toBeNull();
  expect(screen.queryByRole('link', { name: live.phase_legal })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: live.phase_details }));
  expect(await screen.findByText(live.phase_notice)).toBeTruthy();
  expect(screen.getByText(live.phase_retention)).toBeTruthy();
  expect(
    screen.getByRole('link', { name: live.phase_legal }).getAttribute('href')
  ).toBe('https://tuturuuu.com/privacy');
});
