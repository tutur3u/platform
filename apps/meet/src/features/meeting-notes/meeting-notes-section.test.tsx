// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import {
  canReadRoomNotes,
  createMeetRoomSnapshot,
  type MeetRealtimeTokenPayload,
  type MeetRoomSnapshot,
} from '@tuturuuu/realtime/meet';
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
  renderSection({ ended: true, canReadNotes: true });
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
  expect(screen.queryByText(notes.visibility_reader)).toBeNull();
});

it('omits the host sharing control when the surrounding screen already shows it', () => {
  renderSection(
    { ended: true, canReadNotes: true, settings: {} },
    { isHost: true, sharingControl: false }
  );
  expect(mocks.sharing).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: notes.title })).toBeTruthy();
});

/**
 * Builds the viewer policy the way production does: the room's `/room-state`
 * answer (`apps/meet-realtime/src/room-do.ts`) returns `settings` to host
 * tokens only, and `readMeetingRoomPolicy` may then admit a non-host reader
 * through the workspace-admin fallback without adding settings.
 */
function productionPolicy({
  role,
  ended,
  settings,
  present = true,
  workspaceAdmin = false,
}: {
  role: 'host' | 'speaker';
  ended: boolean;
  settings: { shareNotes: boolean; shareNotesAfterMeeting?: boolean };
  present?: boolean;
  workspaceAdmin?: boolean;
}): MeetingNotesPolicy {
  const snapshot: MeetRoomSnapshot = {
    ...createMeetRoomSnapshot(),
    ended,
    settings,
    presence: present
      ? { 'user-2': {} as MeetRoomSnapshot['presence'][string] }
      : {},
  };
  const token = { role, userId: 'user-2' } as MeetRealtimeTokenPayload;
  const roomState = {
    canReadNotes: canReadRoomNotes(snapshot, token),
    ended,
    ...(role === 'host' ? { settings } : {}),
  };
  if (roomState.canReadNotes || role === 'host' || !workspaceAdmin)
    return roomState;
  return { ...roomState, canReadNotes: true };
}

it.each([
  [
    'live sharing during the call',
    { ended: false, settings: { shareNotes: true } },
  ],
  [
    'sharing after the meeting',
    {
      ended: true,
      settings: { shareNotes: false, shareNotesAfterMeeting: true },
    },
  ],
])(
  'gives a participant who reads through %s neutral access text, never the admin text',
  (_label, room) => {
    const policy = productionPolicy({ role: 'speaker', ...room });
    expect(policy.canReadNotes).toBe(true);
    expect(policy.settings).toBeUndefined();
    renderSection(policy);
    expect(screen.queryByText(/workspace admin/i)).toBeNull();
    expect(screen.queryByText(/only the host/i)).toBeNull();
    expect(screen.getByText(notes.visibility_reader)).toBeTruthy();
  }
);

it.each([
  ['a live meeting', { ended: false, settings: { shareNotes: false } }],
  ['an ended meeting', { ended: true, settings: { shareNotes: true } }],
])(
  'gives a workspace admin the host did not share with on %s the same neutral text',
  (_label, room) => {
    const policy = productionPolicy({
      role: 'speaker',
      present: false,
      workspaceAdmin: true,
      ...room,
    });
    expect(policy.canReadNotes).toBe(true);
    expect(policy.settings).toBeUndefined();
    renderSection(policy);
    expect(screen.getByText(notes.visibility_reader)).toBeTruthy();
    expect(screen.queryByText(/only the host/i)).toBeNull();
  }
);

it('keeps the host on the sharing control with the production host policy', () => {
  const policy = productionPolicy({
    role: 'host',
    ended: true,
    settings: { shareNotes: false, shareNotesAfterMeeting: true },
  });
  renderSection(policy, { isHost: true });
  expect(mocks.sharing.mock.calls[0]?.[0]).toMatchObject({
    initialEnabled: true,
  });
  expect(screen.queryByText(notes.visibility_reader)).toBeNull();
});

it('only names the host as a reason, because non-host policies carry no share settings', () => {
  expect(notesAccess({ isHost: true })).toBe('host');
  expect(notesAccess({ isHost: false })).toBe('reader');
});
