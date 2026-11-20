import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  identity: vi.fn(),
  workspace: vi.fn(),
  membership: vi.fn(),
  host: vi.fn(),
  gate: vi.fn(),
  attestation: vi.fn(),
}));
vi.mock('../../meeting-ai/server/workspace-gate', () => ({
  meetAiGateEnv: async () => ({ synthetic: 'env' }),
  isMeetAiEnabledForWorkspace: f.gate,
}));
vi.mock('@tuturuuu/utils/meet-hosting', () => ({
  canVerifiedAccountHostMeeting: f.host,
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: f.membership,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.identity } },
    schema: (name: string) => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle:
              name === 'private' &&
              table === 'workspace_mira_audience_attestations'
                ? f.attestation
                : f.workspace,
          }),
        }),
      }),
    }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle:
            table === 'workspace_mira_audience_attestations'
              ? f.attestation
              : f.workspace,
        }),
      }),
    }),
  }),
}));

import {
  readMiraAdultAttestation,
  readMiraDemoAuthority,
} from './demo-authority';

const actor = {
  id: 'synthetic-actor',
  email: 'synthetic@tuturuuu.com',
  email_confirmed_at: '2026-11-01T00:00:00Z',
  identities: [{ provider: 'email', identity_data: {} }],
};
const workspace = {
  id: 'synthetic-workspace',
  personal: true,
  creator_id: actor.id,
  deleted: false,
};
const request = {
  accountId: actor.id,
  workspaceId: workspace.id,
  meetingId: 'synthetic-meeting',
  admitted: true,
  workspaceMember: true,
  disabledBinding: 'false',
};

beforeEach(() => {
  vi.resetAllMocks();
  f.identity.mockResolvedValue({ data: { user: actor }, error: null });
  f.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  f.workspace.mockResolvedValue({ data: workspace, error: null });
  f.host.mockResolvedValue(false);
  f.gate.mockReturnValue(true);
  f.attestation.mockResolvedValue({ data: null, error: null });
});

it('uses current server Auth and actual creator_id for the staff Personal exception', async () => {
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: true,
    authority: 'verified-personal',
    payer: 'tuturuuu',
  });
  expect(f.identity).toHaveBeenCalledWith(actor.id);
  // Staff never need the paid-subscription lookup.
  expect(f.host).not.toHaveBeenCalled();
  f.workspace.mockResolvedValue({
    data: { ...workspace, creator_id: 'other' },
    error: null,
  });
  expect((await readMiraDemoAuthority(request)).allowed).toBe(false);
});

it('keeps unattested teams and deleted workspaces off even for staff members', async () => {
  f.workspace.mockResolvedValue({
    data: { ...workspace, personal: false },
    error: null,
  });
  expect((await readMiraDemoAuthority(request)).allowed).toBe(false);
  f.workspace.mockResolvedValue({
    data: { ...workspace, deleted: true },
    error: null,
  });
  expect((await readMiraDemoAuthority(request)).allowed).toBe(false);
});

it('fails closed for missing, foreign, unverified or failed authoritative identity reads', async () => {
  for (const user of [
    null,
    { ...actor, id: 'other' },
    { ...actor, email_confirmed_at: null },
  ]) {
    f.identity.mockResolvedValue({ data: { user }, error: null });
    expect((await readMiraDemoAuthority(request)).allowed).toBe(false);
  }
  f.identity.mockRejectedValue(new Error('Synthetic Auth unavailable'));
  expect((await readMiraDemoAuthority(request)).allowed).toBe(false);
});

it('reads only a complete stored attestation and keeps an absent enable binding off', async () => {
  expect(await readMiraAdultAttestation(workspace.id)).toBeNull();
  f.attestation.mockResolvedValue({
    data: {
      ws_id: workspace.id,
      audience: 'adults-only',
      attested_by: 'synthetic-admin',
      attested_at: '2026-11-20T00:00:00Z',
    },
    error: null,
  });
  expect(await readMiraAdultAttestation(workspace.id)).toEqual({
    workspaceId: workspace.id,
    actorId: 'synthetic-admin',
    attestedAt: Date.parse('2026-11-20T00:00:00Z'),
    audience: 'adults-only',
  });
  for (const data of [
    {
      ws_id: 'other',
      audience: 'adults-only',
      attested_by: 'a',
      attested_at: '2026-11-20T00:00:00Z',
    },
    {
      ws_id: workspace.id,
      audience: 'all',
      attested_by: 'a',
      attested_at: '2026-11-20T00:00:00Z',
    },
    {
      ws_id: workspace.id,
      audience: 'adults-only',
      attested_by: null,
      attested_at: '2026-11-20T00:00:00Z',
    },
    {
      ws_id: workspace.id,
      audience: 'adults-only',
      attested_by: 'a',
      attested_at: 'garbage',
    },
  ]) {
    f.attestation.mockResolvedValue({ data, error: null });
    expect(await readMiraAdultAttestation(workspace.id)).toBeNull();
  }
  f.attestation.mockResolvedValue({ data: null, error: { message: 'x' } });
  await expect(readMiraAdultAttestation(workspace.id)).rejects.toThrow();
  f.attestation.mockResolvedValue({ data: null, error: null });
  expect(
    (await readMiraDemoAuthority({ ...request, disabledBinding: undefined }))
      .allowed
  ).toBe(false);
  expect(
    (await readMiraDemoAuthority({ ...request, disabledBinding: 'true' }))
      .allowed
  ).toBe(false);
});

it('rejects a stale membership assertion after the member is removed', async () => {
  f.membership.mockResolvedValue({ ok: false, error: 'membership_missing' });
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: false,
    reason: 'membership',
  });
});

it('uses the Meet hosting rule for non-staff accounts and fails closed when it throws', async () => {
  const paid = { ...actor, email: 'synthetic@example.com' };
  f.identity.mockResolvedValue({ data: { user: paid }, error: null });
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: false,
    reason: 'account',
  });
  expect(f.host).toHaveBeenCalledWith(actor.id, paid);
  f.host.mockResolvedValue(true);
  // Paid, but the Personal workspace has no stored 18+ attestation yet.
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: false,
    reason: 'workspace',
  });
  f.host.mockRejectedValue(new Error('Synthetic entitlement outage'));
  expect((await readMiraDemoAuthority(request)).allowed).toBe(false);
  f.host.mockResolvedValue(true);
  expect(
    (await readMiraDemoAuthority({ ...request, disabledBinding: 'true' }))
      .allowed
  ).toBe(false);
});

it('requires the meeting workspace to pass the Meet AI workspace gate', async () => {
  f.gate.mockReturnValue(false);
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: false,
    reason: 'disabled',
  });
  expect(f.gate).toHaveBeenCalledWith(workspace.id, { synthetic: 'env' });
});

it('admits a paid account in a team workspace with a stored attestation', async () => {
  f.identity.mockResolvedValue({
    data: { user: { ...actor, email: 'synthetic@example.com' } },
    error: null,
  });
  f.host.mockResolvedValue(true);
  f.workspace.mockResolvedValue({
    data: { ...workspace, personal: false, creator_id: 'synthetic-owner' },
    error: null,
  });
  f.attestation.mockResolvedValue({
    data: {
      ws_id: workspace.id,
      audience: 'adults-only',
      attested_by: 'synthetic-owner',
      attested_at: '2026-11-20T00:00:00Z',
    },
    error: null,
  });
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: true,
    authority: 'workspace-admin',
    payer: 'account',
  });
});

it('treats a failed attestation read as no attestation without blocking the staff exception', async () => {
  f.attestation.mockResolvedValue({ data: null, error: { message: 'x' } });
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: true,
    authority: 'verified-personal',
    payer: 'tuturuuu',
  });
  f.workspace.mockResolvedValue({
    data: { ...workspace, personal: false },
    error: null,
  });
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: false,
    reason: 'workspace',
  });
});
