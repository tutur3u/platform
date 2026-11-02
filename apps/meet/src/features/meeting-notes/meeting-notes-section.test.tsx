// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { MeetingNotesSection } from './meeting-notes-section';
import { type MeetingNotesPolicy, notesAccess } from './notes-access';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  sharing: vi.fn((_props: Record<string, unknown>) => null),
}));
vi.mock('@/features/meeting-ai/use-meeting-ai', () => ({
  useMeetingAi: mocks.ai,
}));
vi.mock('@/features/meeting-ai/notes-sharing-control', () => ({
  NotesSharingControl: mocks.sharing,
}));

const notes = messages.meet.notes_page;

function renderSection(
  policy: MeetingNotesPolicy,
  {
    isHost = false,
    sharingControl,
  }: { isHost?: boolean; sharingControl?: boolean } = {}
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingNotesSection
        wsId="ws-1"
        meetingId="meeting-1"
        title="Weekly sync"
        isHost={isHost}
        policy={policy}
        sharingControl={sharingControl}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  mocks.ai.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
    busy: false,
    finish: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('tells denied viewers the notes are not shared and never starts the notes query', () => {
  renderSection({ ended: true, canReadNotes: false });
  expect(screen.getByText(notes.not_shared)).toBeTruthy();
  expect(screen.queryByRole('region', { name: notes.title })).toBeNull();
  expect(mocks.ai).not.toHaveBeenCalled();
});

it('renders the notes and transcript reader for ended meetings', () => {
  renderSection({
    ended: true,
    canReadNotes: true,
    settings: { shareNotesAfterMeeting: true },
  });
  expect(screen.getByRole('region', { name: notes.title })).toBeTruthy();
  expect(mocks.ai).toHaveBeenCalledWith('ws-1', 'meeting-1', [], false);
});

it('gives the host the after-meeting sharing control with its current value', () => {
  renderSection(
    {
      ended: false,
      canReadNotes: true,
      settings: { shareNotesAfterMeeting: true },
    },
    { isHost: true }
  );
  expect(mocks.sharing).toHaveBeenCalledTimes(1);
  expect(mocks.sharing.mock.calls[0]?.[0]).toEqual({
    wsId: 'ws-1',
    meetingId: 'meeting-1',
    initialEnabled: true,
  });
  expect(screen.queryByText(notes.visibility_shared)).toBeNull();
  expect(screen.queryByText(notes.visibility_admin)).toBeNull();
});

it('omits the host sharing control when the surrounding screen already shows it', () => {
  renderSection(
    { ended: true, canReadNotes: true, settings: {} },
    { isHost: true, sharingControl: false }
  );
  expect(mocks.sharing).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: notes.title })).toBeTruthy();
});

it.each([
  [
    'live sharing during the call',
    { ended: false, settings: { shareNotes: true } },
  ],
  [
    'sharing after the meeting',
    { ended: true, settings: { shareNotesAfterMeeting: true } },
  ],
])('explains participant access granted by %s', (_label, policy) => {
  renderSection({ canReadNotes: true, ...policy });
  expect(screen.getByText(notes.visibility_shared)).toBeTruthy();
  expect(screen.queryByText(notes.visibility_admin)).toBeNull();
});

it.each([
  [
    'a live meeting',
    { ended: false, settings: { shareNotesAfterMeeting: true } },
  ],
  ['an ended meeting', { ended: true, settings: { shareNotes: true } }],
  ['a room with no settings', { ended: true }],
])(
  'tells workspace admins on %s why they can read notes the host did not share',
  (_label, policy) => {
    renderSection({ canReadNotes: true, ...policy });
    expect(screen.getByText(notes.visibility_admin)).toBeTruthy();
    expect(screen.queryByText(notes.visibility_shared)).toBeNull();
    expect(screen.queryByText(/only the host/i)).toBeNull();
  }
);

it('derives the access reason from the share flag the room checks for that phase', () => {
  expect(notesAccess({ isHost: true, policy: { ended: true } })).toBe('host');
  expect(
    notesAccess({
      isHost: false,
      policy: { ended: false, settings: { shareNotes: true } },
    })
  ).toBe('shared');
  expect(
    notesAccess({
      isHost: false,
      policy: { ended: true, settings: { shareNotes: true } },
    })
  ).toBe('workspace_admin');
  expect(
    notesAccess({
      isHost: false,
      policy: { ended: true, settings: { shareNotesAfterMeeting: true } },
    })
  ).toBe('shared');
});
