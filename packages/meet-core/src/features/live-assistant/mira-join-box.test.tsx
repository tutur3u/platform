// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import { useRememberMiraJoin } from './mira-join-box';
import {
  forgetMiraJoinChoice,
  markMiraJoinChoiceApplied,
  peekMiraJoinChoice,
  prefersMiraOff,
  rememberMiraJoinChoice,
  rememberMiraPreference,
} from './mira-join-choice';

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);
const remember = () =>
  renderHook(() => useRememberMiraJoin(), { wrapper }).result.current;

beforeEach(() => {
  sessionStorage.clear();
  forgetMiraJoinChoice('room');
});
afterEach(() => vi.restoreAllMocks());

it('keeps an untick from the join screen to seed the lobby and record off', async () => {
  await remember()('room', false);
  // The lobby seeds its box from it without consuming it.
  expect(peekMiraJoinChoice('room')).toMatchObject({
    ticked: false,
    locale: 'en',
    textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  // Peeking never consumes it; recording marks it for one acceptance only.
  expect(prefersMiraOff('room')).toBe(true);
  markMiraJoinChoiceApplied('room', 4);
  expect(peekMiraJoinChoice('room')).toMatchObject({
    ticked: false,
    appliedRevision: 4,
  });
  // Turning Mira on in the call changes the preset for later boxes.
  rememberMiraPreference('room', true);
  expect(prefersMiraOff('room')).toBe(false);
});

it('never rejects, so remembering can never block a join', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no crypto'));
  await expect(remember()('room', true)).resolves.toBeUndefined();
  expect(peekMiraJoinChoice('room')).toBeNull();
  vi.restoreAllMocks();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('private mode');
  });
  await expect(remember()('room', false)).resolves.toBeUndefined();
  // Memory keeps the untick for this page when storage fails.
  expect(prefersMiraOff('room')).toBe(true);
});

it('ignores a stale or malformed remembered choice', () => {
  rememberMiraJoinChoice('room', {
    ticked: true,
    textHash: 'a'.repeat(64),
    locale: 'en',
  });
  const later = Date.now() + 7 * 60 * 60 * 1000;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  expect(peekMiraJoinChoice('room')).toBeNull();
  vi.restoreAllMocks();
  forgetMiraJoinChoice('room');
  sessionStorage.setItem('meet-mira-join:room', '{"ticked":"yes"}');
  expect(peekMiraJoinChoice('room')).toBeNull();
});
