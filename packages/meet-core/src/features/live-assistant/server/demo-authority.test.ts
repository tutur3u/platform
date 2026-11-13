import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ identity: vi.fn(), workspace: vi.fn() }));
vi.mock('server-only', () => ({}));
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
  f.workspace.mockResolvedValue({ data: workspace, error: null });
});

it('uses current server Auth and actual creator_id for the staff Personal exception', async () => {
  expect(await readMiraDemoAuthority(request)).toEqual({
    allowed: true,
    authority: 'verified-personal',
  });
  expect(f.identity).toHaveBeenCalledWith(actor.id);
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
