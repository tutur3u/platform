// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import baseMessages from '../../../../../../apps/meet/messages/en.json';

const { readMeetRecordings, useMeetingAi } = vi.hoisted(() => ({
  readMeetRecordings: vi.fn(),
  useMeetingAi: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({ readMeetRecordings }));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai', () => ({
  useMeetingAi,
}));

import { EndedMeetingFactsRow } from './ended-meeting-facts-row';

const messages = {
  ...baseMessages,
  meet: {
    ...baseMessages.meet,
    call: {
      ...baseMessages.meet.call,
      ended_minutes: '{minutes} min',
      ended_speakers: '{count, plural, one {# speaker} other {# speakers}}',
      ended_recording_saved: 'Recording saved',
      ended_recording_processing: 'Recording processing',
      ended_transcript_ready: 'Transcript ready',
      ended_transcript_processing: 'Transcript processing',
    },
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRow(canSeeNotes: boolean) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <EndedMeetingFactsRow
          wsId="ws"
          meetingId="meeting"
          canSeeNotes={canSeeNotes}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('never queries or renders facts for viewers without notes access', () => {
  useMeetingAi.mockReturnValue({ data: undefined });
  renderRow(false);
  expect(useMeetingAi).toHaveBeenCalledWith('ws', 'meeting', [], false, false);
  expect(readMeetRecordings).not.toHaveBeenCalled();
  expect(screen.queryByTestId('ended-meeting-facts')).toBeNull();
});

it('shows duration, speakers, recording and transcript state from authorized data', async () => {
  useMeetingAi.mockReturnValue({
    data: {
      sessions: [
        {
          created_at: '2026-11-18T10:00:00Z',
          ended_at: '2026-11-18T10:48:00Z',
          notes_status: 'completed',
        },
      ],
      chunks: [
        { status: 'completed', speaker: { accountId: 'a' } },
        { status: 'completed', speaker: { accountId: 'b' } },
      ],
    },
  });
  readMeetRecordings.mockResolvedValue({
    recordings: [
      {
        sessionId: 's',
        startedAt: '2026-11-18T10:00:00Z',
        endedAt: '2026-11-18T10:30:00Z',
        status: 'recording',
      },
    ],
  });
  renderRow(true);
  expect(await screen.findByText('Recording processing')).toBeTruthy();
  expect(screen.getByText('48 min')).toBeTruthy();
  expect(screen.getByText('2 speakers')).toBeTruthy();
  expect(screen.getByText('Transcript ready')).toBeTruthy();
});

it('treats a refused recordings list as unknown rather than empty', async () => {
  useMeetingAi.mockReturnValue({
    data: { sessions: [], chunks: [{ status: 'processing' }] },
  });
  readMeetRecordings.mockRejectedValue(
    new Error('Recording access is disabled')
  );
  renderRow(true);
  expect(await screen.findByText('Transcript processing')).toBeTruthy();
  expect(screen.queryByText(/Recording/)).toBeNull();
});
