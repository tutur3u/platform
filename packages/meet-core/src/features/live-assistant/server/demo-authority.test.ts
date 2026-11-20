import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  identity: vi.fn(),
  workspace: vi.fn(),
  membership: vi.fn(),
  host: vi.fn(),
  gate: vi.fn(),
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
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: f.workspace }) }),
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

it('never creates an attestation and keeps an absent enable binding off', async () => {
  expect(await readMiraAdultAttestation(workspace.id)).toBeNull();
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
