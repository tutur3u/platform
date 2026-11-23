// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetAiSession, MeetAiState } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  choose: vi.fn(),
  draft: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetTranscriptConsent: f.read,
  setMeetTranscriptChoice: f.choose,
  draftMeetAiNotes: f.draft,
}));
vi.mock('./meeting-session-notes', () => ({ MeetingSessionNotes: () => null }));

import { MeetingAiPanel } from './meeting-ai-panel';

const ai = messages.meet.ai;
const session = (over: Partial<MeetAiSession> = {}): MeetAiSession => ({
  id: 's1',
  user_id: 'host',
  created_at: '2026-11-23T09:00:00Z',
  ended_at: null,
  notes_started_at: null,
  notes_status: 'pending',
  notes: null,
  notes_cost_usd: null,
  ...over,
});
const data = (over: Partial<MeetAiState> = {}): MeetAiState => ({
  available: true,
  configured: true,
  canManage: true,
  sessions: [],
  chunks: [],
  model: 'm',
  transcriptionCostUsd: null,
  notesCostUsd: null,
  estimatedCostUsd: null,
  unpricedRequests: null,
  inputTokens: null,
  outputTokens: null,
  ...over,
});
const consent = (ready: boolean, choice: 'allow' | null = 'allow') => ({
  available: true,
  version: 'v1',
  choice,
  fence: {
    ready,
    pending: ready ? 0 : 2,
    declined: ready ? 0 : 1,
    admitted: 3,
  },
  active: true,
  activeSince: 1,
});
function hook(over: Record<string, unknown> = {}) {
  return {
    wsId: 'ws',
    meetingId: 'room',
    data: data(),
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    busy: false,
    phase: null,
    capturing: false,
    captureError: false,
    creditFailure: null,
    recovering: false,
    pendingChunks: 0,
    start: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    ...over,
  } as never;
}
function show(value: never, inCall = true) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetingAiPanel ai={value} inCall={inCall} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  f.read.mockResolvedValue(consent(true, null));
});
afterEach(cleanup);

it('records the host’s own Allow before starting, even before the notice loads', async () => {
  const value = hook();
  f.choose.mockResolvedValue(consent(true));
  show(value);
  expect(screen.getByText(ai.status_idle_title)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ai.start }));
  await vi.waitFor(() =>
    expect((value as { start: () => void }).start).toHaveBeenCalled()
  );
  expect(f.choose).toHaveBeenCalledWith('room', 'allow', 'v1');
});

it('shows a live transcript with the stop action', async () => {
  f.read.mockResolvedValue(consent(true));
  show(hook({ data: data({ sessions: [session()] }), capturing: true }));
  expect(await screen.findByText(ai.capturing)).toBeTruthy();
  expect(screen.getByText(ai.transcript_listening)).toBeTruthy();
  expect(screen.getByRole('button', { name: ai.finish })).toBeTruthy();
});

it('pauses for consent and says how many people it waits for', async () => {
  f.read.mockResolvedValue(consent(false));
  show(hook({ data: data({ sessions: [session()] }), capturing: true }));
  expect(await screen.findByText(ai.status_paused_title)).toBeTruthy();
  expect(
    screen.getByText(
      'Waiting for 2 people to allow the transcript. Audio heard until then is discarded, not saved or sent.'
    )
  ).toBeTruthy();
  expect(screen.getByText('1 person declined.')).toBeTruthy();
});

it('offers notes recovery after a failed run', () => {
  const value = hook({
    data: data({
      sessions: [
        session({
          ended_at: '2026-11-23T09:30:00Z',
          notes_status: 'failed',
        }),
      ],
    }),
  });
  show(value);
  expect(screen.getByText(ai.status_failed_title)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ai.retry_notes }));
  expect((value as { finish: () => void }).finish).toHaveBeenCalledWith('s1');
});

it('explains an off switch without transcript controls', () => {
  show(
    hook({ data: data({ available: false, unavailableReason: 'disabled' }) })
  );
  expect(screen.getByText(ai.off_disabled)).toBeTruthy();
  expect(screen.queryByRole('button', { name: ai.start })).toBeNull();
  expect(screen.queryByText(ai.transcript)).toBeNull();
});

it('lets a notes reader follow without host controls', () => {
  show(hook({ data: data({ canManage: false }) }), false);
  expect(screen.getByText(ai.status_idle_reader)).toBeTruthy();
  expect(screen.queryByRole('button', { name: ai.start })).toBeNull();
});
