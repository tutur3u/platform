// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import { MeetingTranscript } from './meeting-transcript';

afterEach(cleanup);
it('displays each batched source name and timestamp while keeping old mixed chunks unattributed', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingTranscript
        chunks={[
          {
            id: 'new',
            sequence: 0,
            start_seconds: 0,
            duration_seconds: 10,
            status: 'completed',
            transcript: 'Combined',
            cost_usd: null,
            segments: [
              {
                speaker: {
                  accountId: 'alice',
                  displayName: 'Alice',
                  kind: 'microphone',
                },
                kind: 'microphone',
                startSeconds: 0,
                transcript: 'I will review',
              },
              {
                speaker: {
                  accountId: 'bob',
                  displayName: 'bob@example.com',
                  kind: 'shared_audio',
                },
                kind: 'shared_audio',
                startSeconds: 3,
                transcript: 'Shared clip',
              },
            ],
          },
          {
            id: 'old',
            sequence: 1,
            start_seconds: 10,
            duration_seconds: 10,
            status: 'completed',
            transcript: 'Historical mixed audio',
            cost_usd: null,
          },
        ]}
      />
    </NextIntlClientProvider>
  );
  expect(screen.queryByText('Alice')).toBeNull();
  expect(screen.queryByText('bob@example.com')).toBeNull();
  expect(screen.getByText('0:03')).toBeTruthy();
  expect(screen.getAllByText('Unattributed audio')[0]).toBeTruthy();
  expect(screen.getByText('Historical mixed audio')).toBeTruthy();
});

it('renders one removal banner and never renders erased lines or fallback text', () => {
  const chunks = ['one', 'two'].map((id) => ({
    id,
    sequence: 0,
    start_seconds: 0,
    duration_seconds: 1,
    status: 'completed',
    transcript: 'RETAINED fallback',
    cost_usd: null,
    segments: [{ erased: true as const }],
  }));
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingTranscript chunks={chunks} />
    </NextIntlClientProvider>
  );
  expect(
    screen.getAllByText('Some content was removed from this transcript.')
  ).toHaveLength(1);
  expect(screen.queryByText('RETAINED fallback')).toBeNull();
});
