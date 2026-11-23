// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  mira: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetTranscriptConsent: f.read,
  setMeetTranscriptChoice: f.choose,
  readRoomMiraConsent: f.mira,
  setRoomMiraChoice: vi.fn(),
  acceptRoomMira: vi.fn(),
  turnOffRoomMira: vi.fn(),
  reportRoomMiraMinor: vi.fn(),
}));

import { TranscriptConsentNotice } from './transcript-consent-notice';

const ai = messages.meet.ai;
const transcript = {
  available: true,
  version: 'v1',
  choice: null,
  fence: { ready: false, pending: 1, declined: 0, admitted: 2 },
  active: true,
  activeSince: 1,
};
const mira = (choice: 'on' | 'off' | null) => ({
  available: true,
  version: 'v',
  acceptance: { revision: 1, acceptorName: 'Lan', capabilities: ['chat'] },
  choice,
  lastChoice: choice,
  pausing: false,
  ready: choice === 'on',
  canAccept: false,
  status: { active: true, included: 0, admitted: 2 },
  boxTickedByDefault: true,
});
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <TranscriptConsentNotice meetingId="room" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
const allow = () => screen.queryByRole('button', { name: ai.consent_allow });
beforeEach(() => {
  vi.resetAllMocks();
  f.read.mockResolvedValue(transcript);
});
afterEach(cleanup);

it('waits with a disabled Allow while Mira is loading, without a Mira prompt', async () => {
  f.mira.mockReturnValue(new Promise(() => undefined));
  show();
  await screen.findByText(ai.consent_body);
  expect(allow()).toHaveProperty('disabled', true);
  expect(screen.queryByText(ai.consent_mira_off)).toBeNull();
});

it('shows the plain Allow when Mira cannot be read', async () => {
  f.mira.mockRejectedValue(new Error('offline'));
  show();
  await vi.waitFor(() => expect(allow()).toHaveProperty('disabled', false));
  expect(screen.queryByText(ai.consent_mira_off)).toBeNull();
});

it('shows the plain Allow where room Mira is unavailable', async () => {
  f.mira.mockResolvedValue({ available: false });
  show();
  await vi.waitFor(() => expect(allow()).toHaveProperty('disabled', false));
  expect(screen.queryByText(ai.consent_mira_off)).toBeNull();
});

it('offers the Mira box instead of Allow while Mira is off for the caller', async () => {
  f.mira.mockResolvedValue(mira('off'));
  show();
  expect(await screen.findByText(ai.consent_mira_off)).toBeTruthy();
  expect(
    await screen.findByRole('checkbox', {
      name: messages.meet.mira_consent.box_label,
    })
  ).toBeTruthy();
  expect(allow()).toBeNull();
});

it('offers Allow once Mira is on for the caller', async () => {
  f.mira.mockResolvedValue(mira('on'));
  show();
  await vi.waitFor(() => expect(allow()).toHaveProperty('disabled', false));
  expect(screen.queryByText(ai.consent_mira_off)).toBeNull();
});

it('says Mira is not on, without a dead end, when no host acceptance exists', async () => {
  f.mira.mockResolvedValue({ ...mira(null), acceptance: null });
  show();
  expect(await screen.findByText(ai.consent_mira_not_on)).toBeTruthy();
  expect(screen.queryByText(ai.consent_mira_off)).toBeNull();
  expect(allow()).toBeNull();
});
