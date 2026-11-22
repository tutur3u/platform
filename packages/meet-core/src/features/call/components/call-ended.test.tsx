// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

vi.mock('next/link', () => ({
  default: ({
    onClick,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />
  ),
}));
const aiState = vi.hoisted(() => ({
  value: { data: undefined, error: null } as {
    data: unknown;
    error: unknown;
  },
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai', () => ({
  useMeetingAi: () => ({
    ...aiState.value,
    wsId: 'workspace-id',
    meetingId: 'meeting-id',
    busy: false,
    finish: vi.fn(),
  }),
}));
vi.mock('../../meeting-ai/meeting-session-notes', () => ({
  MeetingSessionNotes: () => <div data-testid="session-notes" />,
}));
vi.mock('../../meeting-ai/meeting-transcript', () => ({
  MeetingTranscript: () => <div data-testid="transcript" />,
}));
const layout = vi.hoisted(() => ({ wide: false }));
vi.mock('./ended-layout', () => ({ useWideEndedLayout: () => layout.wide }));
vi.mock(
  '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control',
  () => ({
    NotesSharingControl: () => null,
  })
);
vi.mock('./ended-meeting-settings', () => ({
  EndedMeetingSettings: () => null,
}));
vi.mock('./ended-meeting-facts-row', () => ({
  EndedMeetingFactsRow: ({ canSeeNotes }: { canSeeNotes: boolean }) =>
    canSeeNotes ? <div data-testid="facts-row" /> : null,
}));
vi.mock('./ended-meeting-rating', () => ({
  EndedMeetingRating: () => <div data-testid="rating" />,
}));
vi.mock('./ended-manual-task', () => ({
  EndedManualTask: () => <button type="button">Add task</button>,
}));
vi.mock('./new-meeting-button', () => ({
  NewMeetingButton: () => <button type="button">New meeting</button>,
}));

import { CallEnded } from './call-ended';

afterEach(() => {
  cleanup();
  aiState.value = { data: undefined, error: null };
  layout.wide = false;
});

const notes = { summary: 'Reviewed merge sort' };
const spoken = { status: 'completed', transcript: 'Hello room' };
function withAi(kind: 'none' | 'notes' | 'transcript' | 'both') {
  aiState.value = {
    error: null,
    data: {
      canManage: false,
      configured: true,
      sessions:
        kind === 'notes' || kind === 'both'
          ? [{ id: 's1', ended_at: 'x', notes_status: 'completed', notes }]
          : [],
      chunks: kind === 'transcript' || kind === 'both' ? [spoken] : [],
    },
  };
}

it('refreshes stale personal and workspace meeting caches when returning from a call', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  let meetings = ['old meeting'];
  const keys = [
    ['meetings', 'personal', 1],
    ['meetings', 'workspace-id', 1],
  ];
  for (const queryKey of keys)
    await client.fetchQuery({ queryKey, queryFn: async () => meetings });
  client.setQueryData(['meet-room-state', 'meeting-id'], { ended: false });
  meetings = ['new meeting', 'old meeting'];
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallEnded
          accountId="test-account"
          canManage={false}
          canReadNotes={false}
          wsId="workspace-id"
          meetingId="meeting-id"
          meetingName="Test"
          backHref="/personal/meetings"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('link', { name: 'Back to Meet' }));
  await waitFor(() => {
    for (const key of keys)
      expect(client.getQueryData(key)).toEqual(['new meeting', 'old meeting']);
  });
  expect(
    client.getQueryState(['meet-room-state', 'meeting-id'])?.isInvalidated
  ).toBe(true);
  client.clear();
});

function renderEnded(props: Partial<Parameters<typeof CallEnded>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallEnded
          accountId="test-account"
          canManage={false}
          canReadNotes
          wsId="workspace-id"
          meetingId="meeting-id"
          meetingName="Test"
          backHref="/personal/meetings"
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('renders the supplied notes reader instead of the default reader', () => {
  withAi('both');
  renderEnded({
    initialShowNotes: true,
    notes: <div data-testid="notes-reader" />,
  });
  expect(screen.getByTestId('notes-reader')).toBeTruthy();
  expect(screen.queryByTestId('session-notes')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide notes & transcript' })
  );
  expect(screen.queryByTestId('notes-reader')).toBeNull();
});

it('shows notes and transcript in tabs only when both exist', () => {
  withAi('both');
  renderEnded({ initialShowNotes: true });
  expect(screen.getByRole('tablist')).toBeTruthy();
  expect(
    screen.getByRole('heading', { name: messages.meet.call.ended_reader_both })
  ).toBeTruthy();
  cleanup();
  withAi('notes');
  renderEnded({ initialShowNotes: true });
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.getByTestId('session-notes')).toBeTruthy();
  expect(screen.queryByTestId('transcript')).toBeNull();
});

it('names the button after what the meeting actually has', () => {
  withAi('notes');
  renderEnded();
  fireEvent.click(screen.getByRole('button', { name: 'Show notes' }));
  expect(screen.getByRole('button', { name: 'Hide notes' })).toBeTruthy();
  cleanup();
  withAi('transcript');
  renderEnded();
  expect(screen.getByRole('button', { name: 'Show transcript' })).toBeTruthy();
  cleanup();
  withAi('both');
  renderEnded();
  expect(
    screen.getByRole('button', { name: 'View notes & transcript' })
  ).toBeTruthy();
});

it('keeps the host task action reachable when there is no reader', () => {
  withAi('none');
  renderEnded({ canManage: true });
  expect(screen.getByRole('button', { name: 'Add task' })).toBeTruthy();
  cleanup();
  withAi('notes');
  renderEnded({ canManage: true });
  expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
  cleanup();
  withAi('none');
  renderEnded();
  expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
});

it('hides the button when there is nothing to read or the read failed', () => {
  withAi('none');
  renderEnded({ initialShowNotes: true });
  expect(
    screen.queryByRole('button', { name: /notes|transcript/i })
  ).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Back to Meet' }).dataset.variant
  ).toBe('default');
  cleanup();
  aiState.value = { data: undefined, error: new Error('503') };
  renderEnded({ initialShowNotes: true });
  expect(
    screen.queryByRole('button', { name: /notes|transcript/i })
  ).toBeNull();
  expect(screen.queryByText(messages.meet.ai.workspace_unavailable)).toBeNull();
});

it('holds the button place without a label while the notes state loads', () => {
  renderEnded();
  expect(screen.getByTestId('ended-notes-pending')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: /notes|transcript/i })
  ).toBeNull();
});

it('places the open reader beside the summary on wide screens', () => {
  withAi('notes');
  layout.wide = true;
  renderEnded({ initialShowNotes: true });
  const summary = screen.getByRole('heading', {
    name: messages.meet.call.call_ended_title,
  });
  const reader = screen.getByTestId('session-notes');
  expect(summary.closest('section')?.contains(reader)).toBe(false);
});

it('opens the reader inside the summary card on phones', () => {
  withAi('notes');
  renderEnded({ initialShowNotes: true });
  const summary = screen.getByRole('heading', {
    name: messages.meet.call.call_ended_title,
  });
  expect(
    summary.closest('section')?.contains(screen.getByTestId('session-notes'))
  ).toBe(true);
});

it('never renders the notes reader for viewers without notes access', () => {
  withAi('both');
  renderEnded({
    canReadNotes: false,
    initialShowNotes: true,
    notes: <div data-testid="notes-reader" />,
  });
  expect(screen.queryByTestId('notes-reader')).toBeNull();
  expect(
    screen.queryByRole('button', { name: /notes|transcript/i })
  ).toBeNull();
});

it('leads with the reader and keeps Back to Meet as the secondary action', () => {
  withAi('both');
  renderEnded({ canReadNotes: true });
  const primary = screen.getByRole('button', {
    name: 'View notes & transcript',
  });
  expect(primary.className).toContain('w-full');
  expect(
    screen.getByRole('link', { name: 'Back to Meet' }).dataset.variant
  ).toBe('outline');
});

it('makes Back to Meet the primary action when the viewer cannot read notes', () => {
  renderEnded({ canReadNotes: false });
  expect(
    screen.getByRole('link', { name: 'Back to Meet' }).dataset.variant
  ).toBe('default');
  expect(screen.getAllByRole('link', { name: 'Back to Meet' })).toHaveLength(1);
});

it('shows a left screen with Rejoin and Back, never the connection error, after leaving a live call', () => {
  renderEnded({ lifecycle: 'live', canReadNotes: false });
  expect(
    screen.getByRole('heading', { name: messages.meet.call.call_left_title })
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: messages.meet.call.rejoin_call })
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: messages.meet.call.back_to_meet })
  ).toBeTruthy();
  expect(screen.queryByText(messages.meet.call.join_error_title)).toBeNull();
  expect(
    screen.queryByRole('button', {
      name: messages.meet.call.connection_refresh,
    })
  ).toBeNull();
});

it('offers New meeting in the quiet action row only to viewers allowed to start one', () => {
  renderEnded({ canStartMeeting: true });
  expect(screen.getByRole('button', { name: 'New meeting' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  cleanup();
  renderEnded();
  expect(screen.queryByRole('button', { name: 'New meeting' })).toBeNull();
});

it('shows meeting facts only to viewers who may read notes', () => {
  renderEnded({ canReadNotes: true });
  expect(screen.getByTestId('facts-row')).toBeTruthy();
  cleanup();
  renderEnded({ canReadNotes: false });
  expect(screen.queryByTestId('facts-row')).toBeNull();
});

it('keeps the private rating outside the summary card on both screens', () => {
  renderEnded();
  const summary = screen.getByRole('heading', {
    name: messages.meet.call.call_ended_title,
  });
  expect(
    summary.closest('section')?.contains(screen.getByTestId('rating'))
  ).toBe(false);
  cleanup();
  renderEnded({ lifecycle: 'live', canReadNotes: false });
  expect(screen.getByTestId('rating')).toBeTruthy();
});
