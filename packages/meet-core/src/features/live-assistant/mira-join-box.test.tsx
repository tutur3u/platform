// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import { useRememberMiraJoin } from './mira-join-box';
import {
  peekMiraJoinChoice,
  rememberMiraJoinChoice,
  takeMiraJoinChoice,
} from './mira-join-choice';

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);
const remember = () =>
  renderHook(() => useRememberMiraJoin(), { wrapper }).result.current;

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('keeps an untick from the join screen to seed the lobby and record off', async () => {
  await remember()('room', false);
  // The lobby seeds its box from it without consuming it.
  expect(peekMiraJoinChoice('room')).toMatchObject({
    ticked: false,
    locale: 'en',
    textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  // A later lobby untouched by the guest keeps the same untick.
  expect(takeMiraJoinChoice('room')?.ticked).toBe(false);
  expect(takeMiraJoinChoice('room')).toBeNull();
});

it('never rejects, so remembering can never block a join', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no crypto'));
  await expect(remember()('room', true)).resolves.toBeUndefined();
  expect(peekMiraJoinChoice('room')).toBeNull();
  vi.restoreAllMocks();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('private mode');
  });
  await expect(remember()('room', true)).resolves.toBeUndefined();
});

it('ignores a stale or malformed remembered choice', () => {
  rememberMiraJoinChoice('room', {
    ticked: true,
    textHash: 'a'.repeat(64),
    locale: 'en',
  });
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7 * 60 * 60 * 1000);
  expect(takeMiraJoinChoice('room')).toBeNull();
  sessionStorage.setItem('meet-mira-join:room', '{"ticked":"yes"}');
  expect(takeMiraJoinChoice('room')).toBeNull();
});
