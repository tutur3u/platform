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
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(screen.getByText('bob@example.com')).toBeTruthy();
  expect(screen.getByText('0:03')).toBeTruthy();
  expect(screen.getByText('Unattributed audio')).toBeTruthy();
  expect(screen.getByText('Historical mixed audio')).toBeTruthy();
});
