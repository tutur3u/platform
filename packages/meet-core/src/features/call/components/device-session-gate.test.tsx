// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const mocks = vi.hoisted(() => ({
  token: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMeetCallRealtimeToken: mocks.token,
  updateCurrentUserProfile: vi.fn(),
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

function show(props: Partial<Parameters<typeof CallShell>[0]> = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallShell {...base} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
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
