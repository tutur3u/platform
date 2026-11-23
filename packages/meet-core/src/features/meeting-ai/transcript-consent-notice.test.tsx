// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ read: vi.fn(), choose: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetTranscriptConsent: f.read,
  setMeetTranscriptChoice: f.choose,
}));

import { TranscriptConsentNotice } from './transcript-consent-notice';

const ai = messages.meet.ai;
const view = (over: object = {}) => ({
  available: true,
  version: 'v1',
  choice: null,
  fence: { ready: false, pending: 2, declined: 0, admitted: 3 },
  active: true,
  activeSince: 1,
  ...over,
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
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('stays hidden until the host is transcribing', async () => {
  f.read.mockResolvedValue(view({ active: false }));
  show();
  await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(screen.queryByText(ai.indicator_paused)).toBeNull();
  f.read.mockResolvedValue({ available: false, reason: 'disabled' });
});

it('asks a participant who has not chosen and records only their Allow', async () => {
  f.read.mockResolvedValue(view());
  f.choose.mockResolvedValue(
    view({
      choice: 'allow',
      fence: { ready: false, pending: 1, declined: 0, admitted: 3 },
    })
  );
  show();
  expect(await screen.findByText(ai.consent_body)).toBeTruthy();
  expect(screen.getByText('Waiting for 2 people.')).toBeTruthy();
  expect(screen.getByText('1/3 allowed')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ai.consent_allow }));
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith('room', 'allow', 'v1')
  );
});

it('shows the recording indicator once everyone allowed and lets anyone decline', async () => {
  f.read.mockResolvedValue(
    view({
      choice: 'allow',
      fence: { ready: true, pending: 0, declined: 0, admitted: 3 },
    })
  );
  f.choose.mockResolvedValue(view({ choice: 'decline' }));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: ai.consent_title })
  );
  expect(await screen.findByText(ai.consent_everyone)).toBeTruthy();
  expect(screen.getByText(ai.indicator_live)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ai.consent_decline }));
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith('room', 'decline', 'v1')
  );
});
