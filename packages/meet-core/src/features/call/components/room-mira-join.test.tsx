// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  accept: vi.fn(),
  turnOff: vi.fn(),
  report: vi.fn(),
  transcript: vi.fn(),
  transcriptRead: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: f.read,
  setRoomMiraChoice: f.choose,
  acceptRoomMira: f.accept,
  turnOffRoomMira: f.turnOff,
  reportRoomMiraMinor: f.report,
  setMeetTranscriptChoice: f.transcript,
  readMeetTranscriptConsent: f.transcriptRead,
}));

import {
  forgetMiraJoinChoice,
  peekMiraJoinChoice,
  prefersMiraOff,
  rememberMiraJoinChoice,
} from '../../live-assistant/mira-join-choice';
import { TranscriptConsentNotice } from '../../meeting-ai/transcript-consent-notice';
import { RoomMiraNotice, roomMiraConsentKey } from './room-mira-notice';

const m = messages.meet.mira_consent;
const base = {
  available: true,
  version: 'v',
  acceptance: null,
  choice: null,
  lastChoice: null,
  pausing: false,
  ready: false,
  canAccept: false,
  status: { active: false, included: 0, admitted: 2 },
  boxTickedByDefault: true,
};
const accepted = {
  ...base,
  // The acceptance that was open on the join screens in these tests.
  acceptance: {
    revision: 3,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  status: { active: true, included: 0, admitted: 2 },
};
/** A later acceptance, opened after the participant pressed Join. */
const acceptedLater = {
  ...accepted,
  acceptance: { ...accepted.acceptance, revision: 4 },
};
function show(
  extra?: ReactNode,
  privateUsers?: { userId: string; displayName: string }[]
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoomMiraNotice meetingId="room" privateUsers={privateUsers} />
        {extra}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return client;
}
/** The Join state of someone who unticked; `seenRevision` is what was open. */
const untickAtJoin = (seenRevision = 3) =>
  rememberMiraJoinChoice('room', {
    ticked: false,
    textHash: 'b'.repeat(64),
    locale: 'vi',
    seenRevision,
  });
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  forgetMiraJoinChoice('room');
  f.transcript.mockResolvedValue({});
});
afterEach(cleanup);

it('(a) keeps a Join untick in the header box when Mira is turned on after admission', async () => {
  untickAtJoin(0);
  f.read.mockResolvedValue(acceptedLater);
  show();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  // A later acceptance needs the participant's own confirm.
  expect(f.choose).not.toHaveBeenCalled();
  expect(f.transcript).not.toHaveBeenCalled();
});

it('(a) keeps a Join untick in the transcript notice box too', async () => {
  untickAtJoin(0);
  f.read.mockResolvedValue(acceptedLater);
  f.transcriptRead.mockResolvedValue({
    available: true,
    version: 'v1',
    choice: null,
    fence: { ready: false, pending: 1, declined: 0, admitted: 2 },
    active: true,
    activeSince: 1,
  });
  // Without the header notice, only the transcript notice's box is shown.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TranscriptConsentNotice meetingId="room" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  expect(f.choose).not.toHaveBeenCalled();
  expect(f.transcript).not.toHaveBeenCalled();
});

it('asks for a confirm when the join screen saw a different acceptance', async () => {
  untickAtJoin(2);
  f.read.mockResolvedValue(accepted);
  show();
  expect(await screen.findByRole('button', { name: m.confirm })).toBeTruthy();
  expect(f.choose).not.toHaveBeenCalled();
});

it('never turns a ticked Join box on for someone whose last choice here was off', async () => {
  // A new device or cleared storage: the join screen could not know the off.
  rememberMiraJoinChoice('room', {
    ticked: true,
    textHash: 'b'.repeat(64),
    locale: 'en',
    seenRevision: 4,
  });
  f.read.mockResolvedValue({ ...acceptedLater, lastChoice: 'off' });
  show();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.choose).not.toHaveBeenCalled();
  expect(f.transcript).not.toHaveBeenCalled();
});

it('starts unticked from the server last choice when nothing is stored', async () => {
  f.read.mockResolvedValue({ ...acceptedLater, lastChoice: 'off' });
  show();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  expect(f.choose).not.toHaveBeenCalled();
});

it('keeps a turn-off unticked in a new acceptance on the same tab and after a reload', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off', lastChoice: 'off' });
  show();
  const indicator = m.indicator_on.replace('{name}', 'Lan');
  fireEvent.click(await screen.findByRole('button', { name: indicator }));
  fireEvent.click(await screen.findByRole('button', { name: m.turn_off_me }));
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalled());
  await vi.waitFor(() => expect(prefersMiraOff('room')).toBe(true));
  cleanup();
  // The host turns Mira on again: a new revision with no current choice.
  f.read.mockResolvedValue(acceptedLater);
  show();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  cleanup();
  // A reload keeps session storage but not memory.
  vi.resetModules();
  const fresh = await import('../../live-assistant/mira-join-choice');
  expect(fresh.prefersMiraOff('room')).toBe(true);
});

it('retries a failed Join recording on the next read and keeps the box unticked', async () => {
  untickAtJoin();
  f.read.mockResolvedValue(accepted);
  f.choose
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ...accepted, choice: 'off' });
  const client = show();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(1));
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  // No tight loop: nothing more is sent until the next read.
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.choose).toHaveBeenCalledTimes(1);
  await client.invalidateQueries();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(2));
});

it('(b) shows the box unticked after turning Mira off in the call', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  show();
  const indicator = m.indicator_on.replace('{name}', 'Lan');
  fireEvent.click(await screen.findByRole('button', { name: indicator }));
  fireEvent.click(await screen.findByRole('button', { name: m.turn_off_me }));
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalled());
  // The stored preference is the off state, apart from any Join notice.
  await vi.waitFor(() =>
    expect(peekMiraJoinChoice('room')).toMatchObject({
      ticked: false,
      textHash: '',
      seenRevision: -1,
    })
  );
  fireEvent.click(await screen.findByRole('button', { name: indicator }));
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
});

it('(c) applies the Join state once, after the not-admitted read turns into the admitted view', async () => {
  untickAtJoin();
  f.read.mockResolvedValue({
    available: false,
    joinDefault: true,
    joinRevision: 3,
  });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  const client = show(<RoomMiraNotice meetingId="room" />);
  // Wait for the not-admitted answer itself, not only the call: refetching
  // while the first read is still in flight joins that read instead of
  // starting a new one.
  await vi.waitFor(() =>
    expect(client.getQueryData(roomMiraConsentKey('room'))).toMatchObject({
      available: false,
    })
  );
  expect(f.choose).not.toHaveBeenCalled();
  // The not-admitted phase leaves the participant's Join state untouched.
  expect(peekMiraJoinChoice('room')).toMatchObject({
    ticked: false,
    textHash: 'b'.repeat(64),
    seenRevision: 3,
  });
  f.read.mockResolvedValue(accepted);
  await client.invalidateQueries();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(1));
  await client.invalidateQueries();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(f.choose).toHaveBeenCalledTimes(1);
  expect(f.choose).toHaveBeenCalledWith(
    'room',
    expect.objectContaining({ choice: 'off', source: 'join' })
  );
});

it('(e) keeps a Join untick when storage fails, and the call box starts unticked', async () => {
  const setItem = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('private mode');
    });
  untickAtJoin();
  setItem.mockRestore();
  f.read.mockResolvedValue(acceptedLater);
  show();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  expect(f.choose).not.toHaveBeenCalled();
});
