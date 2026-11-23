// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetAiChunk } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ draft: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({ draftMeetAiNotes: f.draft }));

import { LIVE_NOTES_CHUNKS, MeetingLiveNotes } from './meeting-live-notes';

const ai = messages.meet.ai;
const chunks = (count: number): MeetAiChunk[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    sequence: index,
    start_seconds: index * 10,
    duration_seconds: 10,
    status: 'completed',
    transcript: 'words',
    cost_usd: null,
  }));
const notes = {
  incomplete: true,
  summary: 'Launch moves to Friday.',
  decisions: ['Ship Friday'],
  actionItems: [{ task: 'Email QA', owner: 'An', dueDate: null }],
  openQuestions: [],
};
function show(count: number, canManage = true) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetingLiveNotes
          wsId="ws"
          meetingId="room"
          sessionId="s1"
          chunks={chunks(count)}
          canManage={canManage}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('waits for enough transcript before drafting on its own', () => {
  show(LIVE_NOTES_CHUNKS - 1);
  expect(screen.getByText(ai.live_notes_empty)).toBeTruthy();
  expect(f.draft).not.toHaveBeenCalled();
});

it('drafts once per transcript bucket and shows the draft', async () => {
  f.draft.mockResolvedValue({ sessionId: 's1', basedOnChunks: 90, notes });
  show(LIVE_NOTES_CHUNKS);
  expect(await screen.findByText(notes.summary)).toBeTruthy();
  expect(screen.getByText('Email QA — An')).toBeTruthy();
  expect(f.draft).toHaveBeenCalledOnce();
  expect(f.draft).toHaveBeenCalledWith('ws', 'room', {
    sessionId: 's1',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

it('updates on request only when new transcript exists', async () => {
  f.draft.mockResolvedValue({ sessionId: 's1', basedOnChunks: 3, notes });
  show(3);
  const update = screen.getByRole('button', { name: ai.live_notes_update });
  fireEvent.click(update);
  expect(await screen.findByText(notes.summary)).toBeTruthy();
  expect(
    (
      screen.getByRole('button', {
        name: ai.live_notes_update,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});

it('never drafts for a reader', () => {
  show(LIVE_NOTES_CHUNKS, false);
  expect(
    screen.queryByRole('button', { name: ai.live_notes_update })
  ).toBeNull();
  expect(f.draft).not.toHaveBeenCalled();
});
