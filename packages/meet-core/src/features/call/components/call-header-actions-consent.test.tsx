// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetTranscriptConsent: f.read,
  setMeetTranscriptChoice: f.choose,
}));
vi.mock('../../meeting-ai/use-self-speaker-capture', () => ({
  useSelfSpeakerCapture: f.capture,
}));
vi.mock('../phone/use-phone-chrome', () => ({ usePhoneChrome: () => true }));

import { TranscriptControls } from '../../meeting-ai/transcript-controls';
import { CallHeaderActions } from './call-header-actions';

const ai = messages.meet.ai;
const call = messages.meet.call;

function show() {
  const stream = { id: 'local' } as unknown as MediaStream;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallHeaderActions
          clock={null}
          notice={
            <TranscriptControls
              guest={false}
              meetingId="room"
              room={{
                connectionStatus: 'open',
                localStream: stream,
                state: { participants: {} },
              }}
              wsId="ws"
            />
          }
          settings={<button type="button">settings</button>}
          share={null}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return stream;
}

beforeEach(() => {
  vi.resetAllMocks();
  f.capture.mockReturnValue({
    state: { kind: 'idle' },
    room: undefined,
    active: true,
  });
  f.read.mockResolvedValue({
    available: true,
    version: 'v1',
    choice: null,
    fence: { ready: false, pending: 2, declined: 0, admitted: 3 },
    active: true,
    activeSince: 1,
  });
});
afterEach(cleanup);

it('keeps per-speaker capture running and the consent prompt open with More closed', async () => {
  const stream = show();
  expect(f.capture).toHaveBeenCalledWith(
    expect.objectContaining({ stream, connected: true, inCall: true })
  );
  expect(await screen.findByText(ai.consent_body)).toBeTruthy();
  expect(screen.getByRole('button', { name: call.more_actions })).toBeTruthy();
  expect(screen.queryByText('settings')).toBeNull();
});
