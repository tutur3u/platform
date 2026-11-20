import type { Session } from '@google/genai/web';
import { beforeEach, expect, it, vi } from 'vitest';
import type { LiveEnvironment, LiveTurnArchive } from './storage';
import type { SavedSession } from './session-state';

const f = vi.hoisted(() => ({
  auth: vi.fn(),
  database: vi.fn(),
  room: vi.fn(),
}));
vi.mock('./room', () => ({ liveRoomCommand: f.room }));
vi.mock('./storage', () => ({
  liveAuthUser: f.auth,
  liveDatabase: f.database,
}));

import { executeLiveTool } from './session-tools';

const ownerId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const meetingId = '00000000-0000-4000-8000-000000000003';
const sessionId = '00000000-0000-4000-8000-000000000004';
const actor = {
  id: ownerId,
  email: 'example@tuturuuu.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  identities: [{ provider: 'email' }],
};
const saved = {
  claims: {
    ownerId,
    meetingId,
    sessionId,
    app: 'meet',
    mode: 'personal',
    inputSource: 'private-microphone',
    workspaceAuthority: 'verified-personal',
    consentVersion: 'private-v1',
    consentRevision: 1,
    // Verified staff are funded by the Tuturuuu root workspace.
    billingWorkspaceId: '00000000-0000-0000-0000-000000000000',
  },
  identity: { workspaceId },
  billing: {},
} as SavedSession;
const consent = {
  choice: {
    choice: 'continue',
    accountId: ownerId,
    meetingId,
    version: 'private-v1',
    revision: 1,
  },
};
const selected = { filePath: 'solution.py', original: 'print(1)' };
const sendToolResponse = vi.fn();
const context = {
  saved,
  env: { MEET_AI_DISABLED: 'false' } as LiveEnvironment,
  provider: { sendToolResponse } as unknown as Session,
  archive: {} as LiveTurnArchive,
  emit: vi.fn(),
  emitReview: vi.fn(),
  persist: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  f.auth.mockResolvedValue(actor);
  f.database.mockImplementation((_env, path: string) =>
    path.startsWith('workspace_mira_audience_attestations?')
      ? []
      : path.startsWith('workspaces?')
        ? [
            {
              id: workspaceId,
              creator_id: ownerId,
              personal: true,
              deleted: false,
            },
          ]
        : [{ type: 'MEMBER' }]
  );
  f.room.mockImplementation((_env, _claims, _identity, command) =>
    command.action === 'mira.private.read' ? consent : selected
  );
});

it.each(['read_selected_code', 'explain_code_lines', 'propose_code_fix'])(
  'blocks %s after authority is revoked despite matching session consent',
  async (tool) => {
    f.auth.mockResolvedValue({ ...actor, email_confirmed_at: null });
    await executeLiveTool(context, 'call', tool, {
      id: 'draft',
      explanation: 'Example',
      replacement: 'print(2)',
    });
    expect(f.room).toHaveBeenCalledTimes(1);
    expect(
      sendToolResponse.mock.calls[0]?.[0].functionResponses[0].response
    ).toHaveProperty('error');
  }
);

it('withholds selected code if authority is revoked during the room read', async () => {
  f.auth.mockResolvedValueOnce(actor).mockResolvedValueOnce(null);
  await executeLiveTool(context, 'call', 'read_selected_code', {});
  expect(f.room).toHaveBeenCalledTimes(2);
  expect(f.auth).toHaveBeenCalledTimes(2);
  expect(
    sendToolResponse.mock.calls[0]?.[0].functionResponses[0].response
  ).toHaveProperty('error');
});

it('returns selected code while authority and consent remain current', async () => {
  await executeLiveTool(context, 'call', 'read_selected_code', {});
  expect(
    sendToolResponse.mock.calls[0]?.[0].functionResponses[0].response
  ).toEqual(selected);
});

it('withholds selected code when the saved payer no longer matches billing', async () => {
  const personalBilled = {
    ...context,
    saved: {
      ...saved,
      claims: { ...saved.claims, billingWorkspaceId: workspaceId },
    } as SavedSession,
  };
  await executeLiveTool(personalBilled, 'call', 'read_selected_code', {});
  expect(
    sendToolResponse.mock.calls[0]?.[0].functionResponses[0].response
  ).toHaveProperty('error');
});
