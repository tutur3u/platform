// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vi_messages from '../../../../../../apps/meet/messages/vi.json';

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

import { MIRA_CONSENT_INFO_KEYS } from '../../live-assistant/mira-consent-box';
import {
  forgetMiraJoinChoice,
  rememberMiraJoinChoice,
} from '../../live-assistant/mira-join-choice';
import { TranscriptConsentNotice } from '../../meeting-ai/transcript-consent-notice';
import { RoomMiraNotice } from './room-mira-notice';

const m = messages.meet.mira_consent;
const base = {
  available: true,
  version: 'v',
  acceptance: null,
  choice: null,
  pausing: false,
  ready: false,
  canAccept: false,
  status: { active: false, included: 0, admitted: 2 },
  boxTickedByDefault: true,
};
const accepted = {
  ...base,
  // Accepted before anyone in these tests pressed Join.
  acceptance: {
    revision: 3,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  status: { active: true, included: 0, admitted: 2 },
};
/** An acceptance that started after the participant pressed Join. */
const acceptedLater = {
  ...accepted,
  acceptance: { ...accepted.acceptance, acceptedAt: Date.now() + 60_000 },
};
function show(
  placement: 'chat' | 'header' = 'header',
  details?: ReactNode,
  extra?: ReactNode
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoomMiraNotice
          meetingId="room"
          placement={placement}
          details={details}
        />
        {extra}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return client;
}
const untickAtJoin = () =>
  rememberMiraJoinChoice('room', {
    ticked: false,
    textHash: 'b'.repeat(64),
    locale: 'vi',
  });
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  forgetMiraJoinChoice('room');
  f.transcript.mockResolvedValue({});
});
afterEach(cleanup);

it('shows nothing in the header while Mira is off for a participant', async () => {
  f.read.mockResolvedValue(base);
  show();
  await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(screen.queryByRole('button')).toBeNull();
});

it('lets the host turn Mira on only after confirming the 18+ audience', async () => {
  f.read.mockResolvedValue({ ...base, canAccept: true });
  f.accept.mockResolvedValue(accepted);
  show();
  fireEvent.click(await screen.findByRole('button', { name: m.host_turn_on }));
  const confirm = await screen.findByRole('button', { name: m.host_confirm });
  expect(confirm).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByLabelText(m.host_adults));
  fireEvent.click(confirm);
  await vi.waitFor(() =>
    expect(f.accept).toHaveBeenCalledWith('room', ['chat', 'captions', 'notes'])
  );
});

it('keeps an indicator naming the acceptor and opens the box until the person confirms', async () => {
  f.read.mockResolvedValue({ ...accepted, boxTickedByDefault: false });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  show();
  const label = m.indicator_on.replace('{name}', 'Lan');
  expect(await screen.findByRole('button', { name: label })).toBeTruthy();
  // Opens on its own, preset to the workspace default (unticked here).
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
  expect(screen.getByText(m.adults)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: m.confirm }));
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith(
      'room',
      expect.objectContaining({
        choice: 'off',
        source: 'confirm',
        acceptanceRevision: 3,
        locale: 'en',
        textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    )
  );
  // Off never allows the transcript.
  expect(f.transcript).not.toHaveBeenCalled();
});

it('allows the transcript after a ticked confirm', async () => {
  f.read.mockResolvedValue(accepted);
  f.choose.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  show();
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: m.confirm }));
  await vi.waitFor(() =>
    expect(f.transcript).toHaveBeenCalledWith(
      'room',
      'allow',
      '2026-11-23-transcript-v1'
    )
  );
});

it('records the join box once after admission under a current acceptance', async () => {
  rememberMiraJoinChoice('room', {
    ticked: false,
    textHash: 'b'.repeat(64),
    locale: 'vi',
  });
  f.read.mockResolvedValue(accepted);
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  show();
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith('room', {
      choice: 'off',
      version: expect.any(String),
      acceptanceRevision: 3,
      source: 'join',
      textHash: 'b'.repeat(64),
      locale: 'vi',
    })
  );
  expect(f.choose).toHaveBeenCalledTimes(1);
});

it('never counts a pre-ticked join box when the workspace unticks by default', async () => {
  rememberMiraJoinChoice('room', {
    ticked: true,
    textHash: 'b'.repeat(64),
    locale: 'en',
  });
  f.read.mockResolvedValue({ ...accepted, boxTickedByDefault: false });
  show();
  await screen.findByRole('checkbox', { name: m.box_label });
  expect(f.choose).not.toHaveBeenCalled();
});

it('lets a participant turn Mira off and report a minor in two steps', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  f.report.mockResolvedValue(base);
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: m.indicator_on.replace('{name}', 'Lan'),
    })
  );
  fireEvent.click(await screen.findByRole('button', { name: m.turn_off_me }));
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith(
      'room',
      expect.objectContaining({ choice: 'off', source: 'toggle' })
    )
  );
  // Choosing closes the popover; the indicator stays and opens it again.
  fireEvent.click(
    await screen.findByRole('button', {
      name: m.indicator_on.replace('{name}', 'Lan'),
    })
  );
  fireEvent.click(await screen.findByRole('button', { name: m.report_minor }));
  expect(f.report).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: m.report_minor_confirm })
  );
  await vi.waitFor(() => expect(f.report).toHaveBeenCalledWith('room'));
});

it('ships every notice item and link in English and Vietnamese', () => {
  const vm = vi_messages.meet.mira_consent;
  for (const key of [
    'box_label',
    'adults',
    'link_privacy',
    'link_terms',
    'link_ai',
    ...MIRA_CONSENT_INFO_KEYS,
  ] as const) {
    expect(m[key]).toBeTruthy();
    expect(vm[key]).toBeTruthy();
    expect(vm[key]).not.toBe(m[key]);
  }
  expect(m.box_label).toBe(
    'Mira, our AI assistant, may be turned on in this meeting to provide a helpful experience (notes, captions, answers).'
  );
  expect(m.adults).toBe(
    'Mira is for people 18 or older. Under 18? Untick the box.'
  );
  // Controller, processor, sub-processor and transfer; readers; retention.
  expect(m.info_controller).toMatch(
    /workspace.*Tuturuuu.*Google Gemini.*outside Vietnam/
  );
  expect(m.info_readers).toMatch(/host.*workspace admins/);
  expect(m.info_retention).toMatch(/Audio is not kept/);
});

it('(a) keeps a Join untick in every confirm box when Mira is turned on after admission', async () => {
  untickAtJoin();
  f.read.mockResolvedValue(acceptedLater);
  f.transcriptRead.mockResolvedValue({
    available: true,
    version: 'v1',
    choice: null,
    fence: { ready: false, pending: 1, declined: 0, admitted: 2 },
    active: true,
    activeSince: 1,
  });
  show('header', undefined, <TranscriptConsentNotice meetingId="room" />);
  // The header box and the transcript notice's Mira box both start unticked.
  await vi.waitFor(() =>
    expect(screen.getAllByRole('checkbox', { name: m.box_label })).toHaveLength(
      2
    )
  );
  for (const box of screen.getAllByRole('checkbox', { name: m.box_label }))
    expect(box.getAttribute('aria-checked')).toBe('false');
  // A later acceptance needs the participant's own confirm.
  expect(f.choose).not.toHaveBeenCalled();
  expect(f.transcript).not.toHaveBeenCalled();
});

it('(b) shows the box unticked after turning Mira off in the call', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  show();
  const indicator = m.indicator_on.replace('{name}', 'Lan');
  fireEvent.click(await screen.findByRole('button', { name: indicator }));
  fireEvent.click(await screen.findByRole('button', { name: m.turn_off_me }));
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: indicator }));
  const box = await screen.findByRole('checkbox', { name: m.box_label });
  expect(box.getAttribute('aria-checked')).toBe('false');
});

it('(c) applies the Join state once, after the not-admitted read turns into the admitted view', async () => {
  untickAtJoin();
  f.read.mockResolvedValue({ available: false, joinDefault: true });
  f.choose.mockResolvedValue({ ...accepted, choice: 'off' });
  const client = show('header', undefined, <RoomMiraNotice meetingId="room" />);
  await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(f.choose).not.toHaveBeenCalled();
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
