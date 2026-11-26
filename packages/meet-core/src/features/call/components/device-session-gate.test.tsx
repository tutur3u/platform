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
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const mocks = vi.hoisted(() => ({
  token: vi.fn(() => new Promise(() => {})),
  saveName: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMeetCallRealtimeToken: mocks.token,
  updateCurrentUserProfile: mocks.saveName,
  InternalApiError: class extends Error {},
}));
vi.mock('next/dynamic', () => ({
  default:
    (
      _load: unknown,
      options: { loading: () => ReactNode }
    ): (() => ReactNode) =>
    () =>
      options.loading(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/r/abc',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('./call-shell', () => ({ ConnectedCallShell: () => null }));

import { CallShell } from './device-session-gate';

const call = messages.meet.call;
const base = {
  accountId: 'account',
  defaultDisplayName: 'Linh Tran',
  leaveHref: '/home',
  meetingId: 'meeting',
  meetingName: 'Weekly sync',
  wsId: 'ws',
};

function gate(props: Partial<Parameters<typeof CallShell>[0]> = {}) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallShell {...base} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function show(props: Partial<Parameters<typeof CallShell>[0]> = {}) {
  render(gate(props));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

const sessionDevice = (call: number) =>
  (mocks.token.mock.calls[call] as unknown[] | undefined)?.[2] as
    | { deviceId: string }
    | undefined;

it('asks for the session as the same device after the tab reloads', () => {
  show();
  const first = sessionDevice(0)?.deviceId;
  expect(first).toBeTruthy();
  expect(sessionStorage.getItem('meet:device:meeting:account')).toBe(first);
  // Unmounting drops the page's claim the way unloading does.
  cleanup();
  show();
  expect(sessionDevice(1)?.deviceId).toBe(first);
});

it('asks as a new device when another page overwrote its claim', () => {
  sessionStorage.setItem('meet:device:meeting:account', 'copied-id');
  const write = Storage.prototype.setItem;
  let raced = false;
  // The other page writes its claim right after this page's write.
  const spy = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (this: Storage, name, value) {
      write.call(this, name, value);
      if (name !== 'meet:device-claim:copied-id' || raced) return;
      raced = true;
      write.call(
        this,
        name,
        JSON.stringify({ nonce: 'other-page', at: Date.now() })
      );
    });
  try {
    show();
  } finally {
    spy.mockRestore();
  }
  expect(raced).toBe(true);
  expect(mocks.token).toHaveBeenCalledTimes(1);
  const deviceId = sessionDevice(0)?.deviceId;
  expect(deviceId).toBeTruthy();
  expect(deviceId).not.toBe('copied-id');
  expect(sessionStorage.getItem('meet:device:meeting:account')).toBe(deviceId);
});

it('asks as a new device when another live page holds the tab id', () => {
  sessionStorage.setItem('meet:device:meeting:account', 'copied-id');
  localStorage.setItem(
    'meet:device-claim:copied-id',
    JSON.stringify({ nonce: 'original-tab', at: Date.now() })
  );
  show();
  expect(sessionDevice(0)?.deviceId).not.toBe('copied-id');
});

it('keeps the full-screen loading step while the redesigned flow is off', () => {
  show();
  expect(mocks.token).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: new RegExp(call.join_now) })
  ).toBeNull();
});

it('shows the pre-join stage with a spinner Join while the session loads', () => {
  show({ meetUxV2: true });
  expect(mocks.token).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Weekly sync' })).toBeTruthy();
  const join = screen.getByRole('button', { name: new RegExp(call.join_now) });
  expect(join).toHaveProperty('disabled', true);
  expect(join.querySelector('svg.animate-spin')).toBeTruthy();
});

it('asks for the name before it opens a session', () => {
  show({ meetUxV2: true, nameSetup: { initialName: 'Linh' } });
  expect(mocks.token).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: call.your_name })).toHaveProperty(
    'value',
    'Linh'
  );
  expect(
    screen.getByRole('button', { name: call.save_name_continue })
  ).toHaveProperty('disabled', false);
});

it('preserves and saves a name filled into the server field before hydration', async () => {
  const tree = gate({ meetUxV2: true, nameSetup: { initialName: '' } });
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);

  const field = screen.getByRole<HTMLInputElement>('textbox', {
    name: call.your_name,
  });
  const save = screen.getByRole('button', { name: call.save_name_continue });
  expect(save).toHaveProperty('disabled', true);

  // Browsers may fill the server-rendered input before React can observe events.
  field.value = '  Linh Tran  ';
  render(tree, { container, hydrate: true });

  expect(screen.getByRole('textbox', { name: call.your_name })).toBe(field);
  expect(field.value).toBe('  Linh Tran  ');
  expect(save).toHaveProperty('disabled', false);
  expect(mocks.token).not.toHaveBeenCalled();

  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.saveName).toHaveBeenCalledWith(
      { display_name: 'Linh Tran' },
      undefined,
      undefined
    )
  );

  fireEvent.change(field, { target: { value: '' } });
  expect(save).toHaveProperty('disabled', true);
  fireEvent.change(field, { target: { value: 'Bo' } });
  expect(save).toHaveProperty('disabled', false);

  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.saveName).toHaveBeenLastCalledWith(
      { display_name: 'Bo' },
      undefined,
      undefined
    )
  );
});
