// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  clearLiveSession,
  type LiveSessionControls,
  type LiveSessionSnapshot,
  publishLiveSession,
  useLiveSession,
} from './live-session-store';

function controls(): LiveSessionControls {
  return {
    start: vi.fn(async () => {}),
    send: vi.fn(),
    stop: vi.fn(async () => {}),
    decide: vi.fn(async () => {}),
    openConsent: vi.fn(),
  };
}

function snapshot(
  owner: LiveSessionControls,
  overrides: Partial<LiveSessionSnapshot> = {}
): LiveSessionSnapshot {
  return {
    meetingId: 'room',
    accountId: 'actor',
    status: 'idle',
    mode: 'personal',
    transcript: [],
    reviews: [],
    error: undefined,
    accepted: true,
    audioSuppressed: false,
    meetingMicOn: false,
    controls: owner,
    ...overrides,
  };
}

function Probe({ accountId }: { accountId?: string }) {
  const session = useLiveSession('room', accountId);
  return <output aria-label="owner">{session ? 'present' : 'none'}</output>;
}

afterEach(() => {
  cleanup();
});

it('keeps a newer panel session when an older panel unmounts late', () => {
  const older = controls();
  const newer = controls();
  act(() => publishLiveSession(snapshot(older)));
  act(() => publishLiveSession(snapshot(newer)));
  act(() => clearLiveSession(older));
  render(<Probe accountId="actor" />);
  expect(screen.getByLabelText('owner').textContent).toBe('present');
  act(() => clearLiveSession(newer));
  expect(screen.getByLabelText('owner').textContent).toBe('none');
});

it('only exposes a session to the matching meeting and account', () => {
  const owner = controls();
  act(() => publishLiveSession(snapshot(owner)));
  render(<Probe accountId="someone-else" />);
  expect(screen.getByLabelText('owner').textContent).toBe('none');
  cleanup();
  render(<Probe />);
  expect(screen.getByLabelText('owner').textContent).toBe('none');
  cleanup();
  render(<Probe accountId="actor" />);
  expect(screen.getByLabelText('owner').textContent).toBe('present');
  act(() => clearLiveSession(owner));
});
