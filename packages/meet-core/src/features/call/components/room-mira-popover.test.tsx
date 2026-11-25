// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RoomMiraConsent } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const api = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  confirm: vi.fn(),
  transcript: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: api.read,
  setRoomMiraChoice: api.choose,
  confirmMeetMiraAccount: api.confirm,
  readMeetTranscriptConsent: api.transcript,
}));
vi.mock('../prejoin/prejoin-context', () => ({ useMeetUxV2: () => true }));
vi.mock('../../live-assistant/mira-consent-box', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../live-assistant/mira-consent-box')>()),
  hashMiraConsentText: async () => 'a'.repeat(64),
}));

import { RoomMiraNotice, roomMiraConsentKey } from './room-mira-notice';

const m = messages.meet.mira_consent;
const base = {
  available: true,
  version: 'v',
  acceptance: {
    revision: 1,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 1,
  },
  accountConfirmation: 'required',
  choice: null,
  lastChoice: null,
  pausing: false,
  ready: false,
  canAccept: false,
  noticeMode: 'room',
  status: { active: true, included: 0, admitted: 2 },
  boxTickedByDefault: true,
} satisfies RoomMiraConsent;

type View = Extract<RoomMiraConsent, { available: true }>;

function show(view: View) {
  api.read.mockResolvedValue(view);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoomMiraNotice meetingId="room" accountId="account" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return (next: View) => {
    api.read.mockResolvedValue(next);
    act(() => client.setQueryData(roomMiraConsentKey('room'), next));
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.transcript.mockResolvedValue({ available: false });
});
afterEach(cleanup);

it('uses one confirmation and keeps the account confirmed on later host activation', async () => {
  const confirmed: View = { ...base, accountConfirmation: 'confirmed' };
  api.confirm.mockResolvedValue(confirmed);
  api.choose.mockImplementation(async (_id, input: { acceptanceRevision: number }) => ({
    ...confirmed,
    acceptance: { ...base.acceptance, revision: input.acceptanceRevision },
    choice: 'on',
    lastChoice: 'on',
  }));
  const update = show(base);
  await screen.findByRole('dialog', { name: m.account_title });
  expect(screen.getAllByText(m.account_statement)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: m.confirm }));
  await waitFor(() => expect(api.choose).toHaveBeenCalledWith(
    'room', expect.objectContaining({ choice: 'on', source: 'join' })
  ));
  expect(api.confirm).toHaveBeenCalledWith('room', 'account');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: messages.meet.live.title }));
  await waitFor(() => expect(screen.getByRole('switch', { name: m.personal_switch }).getAttribute('aria-checked')).toBe('true'));
  update({ ...confirmed, acceptance: { ...base.acceptance, revision: 2 } });
  await waitFor(() => expect(api.choose).toHaveBeenCalledWith(
    'room', expect.objectContaining({ choice: 'on', acceptanceRevision: 2 })
  ));
  expect(screen.queryByRole('dialog', { name: m.account_title })).toBeNull();
  expect(api.confirm).toHaveBeenCalledOnce();
});

it('shows one compact status row and reserves the host section for hosts', async () => {
  const on: View = { ...base, accountConfirmation: 'confirmed', choice: 'on', lastChoice: 'on' };
  const update = show(on);
  fireEvent.click(await screen.findByRole('button', { name: messages.meet.live.title }));
  expect(screen.getAllByText(m.status_by.replace('{name}', 'Lan'))).toHaveLength(1);
  expect(screen.queryByText(m.you_on)).toBeNull();
  expect(screen.queryByRole('region', { name: m.host_section })).toBeNull();
  update({ ...on, canAccept: true });
  expect(await screen.findByRole('region', { name: m.host_section })).toBeTruthy();
  expect(screen.getByRole('button', { name: m.host_turn_off })).toBeTruthy();
});

it('keeps a recorded opt-out and opens the one dialog when the person tries turning Mira on', async () => {
  const update = show({ ...base, lastChoice: 'off', accountConfirmation: 'confirmed' });
  await screen.findByRole('button', { name: messages.meet.live.title });
  expect(api.choose).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: m.account_title })).toBeNull();
  update({ ...base, lastChoice: 'off' });
  fireEvent.click(screen.getByRole('button', { name: messages.meet.live.title }));
  fireEvent.click(screen.getByRole('switch', { name: m.personal_switch }));
  expect(await screen.findByRole('dialog', { name: m.account_title })).toBeTruthy();
  expect(api.choose).not.toHaveBeenCalled();
});
