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
beforeEach(() => {
  vi.resetAllMocks();
  f.read.mockResolvedValue({
    version: 'synthetic-v1',
    available: true,
    choice: null,
  });
  f.write.mockResolvedValue({});
  stop.mockResolvedValue(undefined);
});
afterEach(cleanup);
function show() {
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
          onAccepted={accepted}
          onStop={stop}
          onLeave={vi.fn()}
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
