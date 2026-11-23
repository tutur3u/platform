import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  authority: vi.fn(),
  attestation: vi.fn(),
  env: vi.fn(),
  gate: vi.fn(),
  room: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./demo-authority', () => ({ readMiraDemoAuthority: f.authority }));
vi.mock('./mira-attestation', () => ({
  readMiraAdultAttestation: f.attestation,
}));
vi.mock('../../meeting-ai/server/workspace-gate', () => ({
  meetAiGateEnv: f.env,
  isMeetAiEnabledForWorkspace: f.gate,
}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.room }));
vi.mock('../../call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import {
  readRoomMiraAvailability,
  requireRoomMiraAuthority,
  requireRoomMiraFence,
} from './room-mira-authority';

const WS = '00000000-0000-4000-8000-0000000000a1';
const access = {
  user: { id: 'requester' },
  canReadWorkspace: true,
  meeting: { id: 'meeting', ws_id: WS },
} as never;
const stored = {
  workspaceId: WS,
  actorId: 'admin',
  attestedAt: 1000,
  audience: 'adults-only',
};

beforeEach(() => {
  vi.resetAllMocks();
  f.env.mockResolvedValue({
    MEET_AI_DISABLED: 'false',
    GOOGLE_GENERATIVE_AI_API_KEY: 'synthetic-key',
  });
  f.gate.mockReturnValue(true);
  f.attestation.mockResolvedValue(stored);
  f.authority.mockResolvedValue({
    allowed: true,
    authority: 'workspace-admin',
    payer: 'account',
  });
});

it('bills the meeting workspace for paid requesters and root for staff', async () => {
  await expect(requireRoomMiraAuthority(access)).resolves.toEqual({
    payer: 'account',
    billingWorkspaceId: WS,
    apiKey: 'synthetic-key',
  });
  expect(f.authority).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: 'requester',
      workspaceId: WS,
      meetingId: 'meeting',
      workspaceMember: true,
      disabledBinding: 'false',
    })
  );
  f.authority.mockResolvedValue({
    allowed: true,
    authority: 'verified-personal',
    payer: 'tuturuuu',
  });
  await expect(requireRoomMiraAuthority(access)).resolves.toMatchObject({
    payer: 'tuturuuu',
    billingWorkspaceId: '00000000-0000-0000-0000-000000000000',
  });
});

it('maps denials and always requires the stored 18+ attestation', async () => {
  for (const [reason, code] of [
    ['disabled', 'MIRA_DEPLOYMENT_DISABLED'],
    ['workspace', 'MIRA_WORKSPACE_UNAVAILABLE'],
    ['account', 'MIRA_ACCOUNT_UNAVAILABLE'],
    ['membership', 'MIRA_ACCOUNT_UNAVAILABLE'],
  ]) {
    f.authority.mockResolvedValueOnce({ allowed: false, reason });
    await expect(requireRoomMiraAuthority(access)).rejects.toMatchObject({
      status: 403,
      code,
    });
  }
  // A staff-owned Personal workspace still needs its attestation for room content.
  f.authority.mockResolvedValue({
    allowed: true,
    authority: 'verified-personal',
    payer: 'tuturuuu',
  });
  f.attestation.mockResolvedValue(null);
  await expect(requireRoomMiraAuthority(access)).rejects.toMatchObject({
    status: 403,
    code: 'MIRA_WORKSPACE_UNAVAILABLE',
  });
  f.attestation.mockResolvedValue(stored);
  f.env.mockResolvedValue({ MEET_AI_DISABLED: 'false' });
  await expect(requireRoomMiraAuthority(access)).rejects.toMatchObject({
    status: 503,
  });
});

it('requires a current acceptance and the requester to be on', async () => {
  // Others still deciding never block the requester.
  f.room.mockResolvedValue({ ready: false, status: { included: 3 } });
  await expect(requireRoomMiraFence(access)).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  expect(f.room).toHaveBeenCalledWith(access, { action: 'mira.room.read' });
  f.room.mockResolvedValue({});
  await expect(requireRoomMiraFence(access)).rejects.toMatchObject({
    status: 409,
  });
  f.room.mockResolvedValue({ fence: { ready: true } });
  await expect(requireRoomMiraFence(access)).rejects.toMatchObject({
    status: 409,
  });
  f.room.mockResolvedValue({ ready: true, status: { included: 1 } });
  await expect(requireRoomMiraFence(access)).resolves.toBeUndefined();
});

it('offers the notice only when the deployment, gate, attestation and provider allow it', async () => {
  expect(await readRoomMiraAvailability(access)).toBe(true);
  f.gate.mockReturnValueOnce(false);
  expect(await readRoomMiraAvailability(access)).toBe(false);
  f.attestation.mockResolvedValueOnce(null);
  expect(await readRoomMiraAvailability(access)).toBe(false);
  f.attestation.mockRejectedValueOnce(new Error('synthetic'));
  expect(await readRoomMiraAvailability(access)).toBe(false);
  for (const env of [
    { MEET_AI_DISABLED: 'true', GOOGLE_GENERATIVE_AI_API_KEY: 'k' },
    { MEET_AI_DISABLED: 'false' },
    undefined,
  ]) {
    f.env.mockResolvedValueOnce(env);
    expect(await readRoomMiraAvailability(access)).toBe(false);
  }
});
