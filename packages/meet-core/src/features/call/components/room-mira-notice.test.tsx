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
  peekMiraJoinChoice,
  rememberMiraJoinChoice,
} from '../../live-assistant/mira-join-choice';
import { RoomMiraNotice } from './room-mira-notice';

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
  // The meeting's notice is known once the room is read; a room without a
  // live transcript uses the room-capture notice.
  f.transcriptRead.mockResolvedValue({ available: false });
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
  untickAtJoin();
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
    seenRevision: 3,
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
  fireEvent.click(await screen.findByRole('button', { name: m.about }));
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

it('is one compact control: a short label, a status dot and the full statement as its name', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  show();
  const name = m.indicator_on.replace('{name}', 'Lan');
  const control = await screen.findByRole('button', { name });
  // Only one control, labelled "Mira" with no 18+ badge.
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(control.textContent).toContain('Mira');
  expect(control.textContent).not.toContain('18+');
  expect(control.querySelector('[data-state="on"]')).toBeTruthy();
  expect(control.getAttribute('aria-label')).toBe(name);
  // The dot's meaning is part of its description for assistive tech.
  expect(screen.getByRole('button', { name, description: m.you_on })).toBe(
    control
  );
  // The popover opens with the same full statement.
  fireEvent.click(control);
  expect(
    (await screen.findAllByText(name)).some((node) => node.tagName === 'P')
  ).toBe(true);
});

it('shows amber while the choice is pending and muted once the person turned Mira off', async () => {
  f.read.mockResolvedValue(accepted);
  show();
  const name = m.indicator_on.replace('{name}', 'Lan');
  const pending = await screen.findByRole('button', { name });
  expect(pending.querySelector('[data-state="choose"]')).toBeTruthy();
  cleanup();
  f.read.mockResolvedValue({ ...accepted, choice: 'off' });
  show();
  const off = await screen.findByRole('button', { name });
  expect(off.querySelector('[data-state="off"]')).toBeTruthy();
});

it('gathers every notice in About Mira, with the 18+ rule and the report', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: m.indicator_on.replace('{name}', 'Lan'),
    })
  );
  // Collapsed: no notice text and no report until About Mira is opened.
  expect(screen.queryByText(m.info_retention)).toBeNull();
  expect(screen.queryByRole('button', { name: m.report_minor })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: m.about }));
  expect(screen.getByText(messages.meet.mira_adults.notice)).toBeTruthy();
  for (const key of MIRA_CONSENT_INFO_KEYS)
    expect(screen.getByText(m[key])).toBeTruthy();
  for (const key of ['link_privacy', 'link_terms', 'link_ai'] as const)
    expect(screen.getByRole('link', { name: m[key] })).toBeTruthy();
  expect(screen.getByRole('button', { name: m.report_minor })).toBeTruthy();
});

it('lists who is using Mira privately and offers the host a turn-off for everyone', async () => {
  f.read.mockResolvedValue({
    ...accepted,
    choice: 'on',
    ready: true,
    canAccept: true,
  });
  f.turnOff.mockResolvedValue(base);
  show(undefined, [{ userId: 'u1', displayName: 'Minh' }]);
  fireEvent.click(
    await screen.findByRole('button', {
      name: m.indicator_on.replace('{name}', 'Lan'),
    })
  );
  expect(
    screen.getByText(
      messages.meet.live.phase_private_indicator.replace('{name}', 'Minh')
    )
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: m.host_turn_off }));
  await vi.waitFor(() => expect(f.turnOff).toHaveBeenCalled());
});

it('gives people who are not the host no turn-off for everyone', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: 'on', ready: true });
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: m.indicator_on.replace('{name}', 'Lan'),
    })
  );
  await screen.findByRole('button', { name: m.turn_off_me });
  expect(screen.queryByRole('button', { name: m.host_turn_off })).toBeNull();
  expect(
    screen.queryByText(
      messages.meet.live.phase_private_indicator.replace('{name}', '')
    )
  ).toBeNull();
});

it('ships the About Mira, dismiss and off-line copy in English and Vietnamese', () => {
  const vm = vi_messages.meet.mira_consent;
  for (const key of ['about', 'dismiss_line', 'system_off'] as const) {
    expect(m[key]).toBeTruthy();
    expect(vm[key]).toBeTruthy();
    expect(vm[key]).not.toBe(m[key]);
  }
  expect('badge' in messages.meet.mira_adults).toBe(false);
  expect('badge' in vi_messages.meet.mira_adults).toBe(false);
});

it('records an explicit off when someone unticked before any acceptance', async () => {
  untickAtJoin(0);
  f.read.mockResolvedValue(base);
  f.choose.mockResolvedValue({ ...base, lastChoice: 'off' });
  show();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(1));
  // Revision 0 means no acceptance; the room declines the transcript with it.
  expect(f.choose).toHaveBeenCalledWith('room', {
    choice: 'off',
    version: expect.any(String),
    acceptanceRevision: 0,
    source: 'join',
    textHash: 'b'.repeat(64),
    locale: 'vi',
  });
  expect(f.transcript).not.toHaveBeenCalled();
  expect(peekMiraJoinChoice('room')?.ticked).toBe(false);
});

it('records the off once, and not again when the server already has it', async () => {
  untickAtJoin(0);
  f.read.mockResolvedValue(base);
  f.choose.mockResolvedValue({ ...base, lastChoice: 'off' });
  const client = show();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(1));
  await client.invalidateQueries();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.choose).toHaveBeenCalledTimes(1);
  cleanup();
  // The same untick on a read that already carries the off sends nothing.
  f.choose.mockClear();
  untickAtJoin(0);
  f.read.mockResolvedValue({ ...base, lastChoice: 'off' });
  show();
  await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.choose).not.toHaveBeenCalled();
});

it('records nothing for a ticked box until an acceptance exists', async () => {
  rememberMiraJoinChoice('room', {
    ticked: true,
    textHash: 'b'.repeat(64),
    locale: 'en',
    seenRevision: 0,
  });
  f.read.mockResolvedValue(base);
  show();
  await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.choose).not.toHaveBeenCalled();
  expect(f.transcript).not.toHaveBeenCalled();
});

it('hashes the notice again when the Join hash is missing', async () => {
  rememberMiraJoinChoice('room', {
    ticked: false,
    textHash: '',
    locale: 'vi',
    seenRevision: 0,
  });
  f.read.mockResolvedValue(base);
  f.choose.mockResolvedValue({ ...base, lastChoice: 'off' });
  show();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(1));
  expect(f.choose).toHaveBeenCalledWith(
    'room',
    expect.objectContaining({
      choice: 'off',
      acceptanceRevision: 0,
      textHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      locale: 'en',
    })
  );
});

it('retries a failed explicit off on the next read, never in a loop', async () => {
  untickAtJoin(0);
  f.read.mockResolvedValue(base);
  f.choose
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ...base, lastChoice: 'off' });
  const client = show();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.choose).toHaveBeenCalledTimes(1);
  await client.invalidateQueries();
  await vi.waitFor(() => expect(f.choose).toHaveBeenCalledTimes(2));
});
