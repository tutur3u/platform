import type { Session } from '@google/genai/web';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  MIRA_ACCOUNT_CONFIRMATION_KEY,
  MIRA_ACCOUNT_CONFIRMATION_VERSION,
} from '../../features/live-assistant/account-confirmation';
import type { SavedSession } from './session-state';
import type { LiveEnvironment, LiveTurnArchive } from './storage';

const f = vi.hoisted(() => ({
  auth: vi.fn(),
  database: vi.fn(),
  room: vi.fn(),
  poll: vi.fn(),
}));
vi.mock('./room', () => ({ liveRoomCommand: f.room, livePollCommand: f.poll }));
vi.mock('./storage', () => ({
  liveAuthUser: f.auth,
  liveDatabase: f.database,
}));

import { executeLiveTool } from './session-tools';

const ownerId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const meetingId = '00000000-0000-4000-8000-000000000003';
const sessionId = '00000000-0000-4000-8000-000000000004';
const tutor = [{ assistant: true, body: 'Plants turn light into sugar.' }];
const saved = (mode: 'personal' | 'room' = 'personal') =>
  ({
    claims: {
      ownerId,
      meetingId,
      sessionId,
      app: 'meet',
      mode,
      inputSource: 'private-microphone',
      workspaceAuthority: 'verified-personal',
      consentVersion: 'private-v1',
      consentRevision: 1,
      billingWorkspaceId: workspaceId,
    },
    identity: { workspaceId, isHost: true, displayName: 'Host' },
    billing: {},
    reviews: [],
  }) as unknown as SavedSession;
const consent = {
  choice: {
    choice: 'continue',
    accountId: ownerId,
    meetingId,
    version: 'private-v1',
    revision: 1,
  },
};
const sendToolResponse = vi.fn();
const run = (
  name: string,
  options: { mode?: 'personal' | 'room'; uxV2?: boolean } = {}
) =>
  executeLiveTool(
    {
      saved: saved(options.mode),
      env: {
        MEET_UX_V2: options.uxV2 === false ? 'false' : 'true',
        MEET_AI_DISABLED: 'false',
        MEET_AI_PROTECTED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000ee',
        MEET_AI_ALL_WORKSPACES: 'reviewed-allow-all-2026-11-20',
      } as LiveEnvironment,
      provider: { sendToolResponse } as unknown as Session,
      archive: {} as LiveTurnArchive,
      emit: vi.fn(),
      emitReview: vi.fn(),
      persist: vi.fn(),
    },
    'call',
    name,
    {}
  );
const response = () =>
  sendToolResponse.mock.calls.at(-1)?.[0].functionResponses[0].response;
const shareReads = () =>
  f.room.mock.calls.filter(
    ([, , , command]) => command.action === 'mira.share.private.read'
  );
const confirmed = (marker: unknown) => ({
  id: ownerId,
  app_metadata: { [MIRA_ACCOUNT_CONFIRMATION_KEY]: marker },
});

beforeEach(() => {
  vi.resetAllMocks();
  f.room.mockImplementation((_env, _claims, _identity, command) =>
    command.action === 'mira.private.read' ? consent : { tutor }
  );
});

// Runs first: a confirmed account is cached for the rest of this file.
it('refuses unconfirmed accounts before reading anything shared', async () => {
  f.auth.mockResolvedValue(confirmed(undefined));
  await run('read_shared_notes');
  expect(response()).toHaveProperty('error');
  expect(shareReads()).toHaveLength(0);
});

it('refuses Room Mira and the flag-off build without asking the room', async () => {
  f.auth.mockResolvedValue(confirmed(MIRA_ACCOUNT_CONFIRMATION_VERSION));
  await run('read_shared_notes', { mode: 'room' });
  expect(response()).toHaveProperty('error');
  await run('read_shared_notes', { uxV2: false });
  expect(response()).toHaveProperty('error');
  expect(f.room).not.toHaveBeenCalled();
});

it('reads only this session owner’s grant and stops as soon as it is revoked', async () => {
  f.auth.mockResolvedValue(confirmed(MIRA_ACCOUNT_CONFIRMATION_VERSION));
  await run('read_shared_notes');
  expect(response()).toEqual({ tutor });
  expect(shareReads()[0]?.[3]).toEqual({
    action: 'mira.share.private.read',
    sessionId,
  });
  expect(shareReads()[0]?.[1]).toMatchObject({ ownerId, mode: 'personal' });

  f.room.mockImplementation(async (_env, _claims, _identity, command) => {
    if (command.action === 'mira.private.read') return consent;
    throw new Error('live_room_403');
  });
  await run('read_shared_notes');
  expect(response()).toHaveProperty('error');
});

it('keeps Mira from launching polls under the redesign', async () => {
  await run('launch_poll');
  expect(response()).toHaveProperty('error');
  expect(f.poll).not.toHaveBeenCalled();
  expect(f.room).not.toHaveBeenCalled();

  f.auth.mockResolvedValue(confirmed(MIRA_ACCOUNT_CONFIRMATION_VERSION));
  f.poll.mockResolvedValue({ ok: true });
  await run('draft_poll');
  expect(response()).toEqual({ ok: true });
  expect(f.poll).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    'draft_poll',
    {}
  );
});
