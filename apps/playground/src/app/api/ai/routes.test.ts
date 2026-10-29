import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  generateObject: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getVerifiedAuthUser: vi.fn(),
  google: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: unknown[]) => mocks.google(...args),
}));
vi.mock('@tuturuuu/ai/core', () => ({
  generateObject: (...args: unknown[]) => mocks.generateObject(...args),
}));
vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: unknown[]) => mocks.withAiMemory(...args),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (...args: unknown[]) =>
    mocks.getSatelliteAppSessionUser(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));
vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: (...args: unknown[]) =>
    mocks.getVerifiedAuthUser(...args),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

const objectGeneration = await import('./object-generation/route');
const toolCalling = await import('./tool-calling/route');
const { ROOT_WORKSPACE_ID } = await import('@tuturuuu/utils/constants');

const admin = { id: 'admin-client' };
const staffAuthUser = {
  email: 'person@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  id: 'user-1',
  identities: [{ identity_data: {}, provider: 'email' }],
};
const generated = {
  tasks: [{ internalReasoning: 'fake reasoning', name: 'x' }],
};

const routes = [
  ['object-generation', objectGeneration],
  ['tool-calling', toolCalling],
] as const;

describe('playground AI routes require a signed-in staff session', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.google.mockReturnValue({ id: 'fake-model' });
    mocks.generateObject.mockResolvedValue({ object: generated });
    mocks.getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
    mocks.getVerifiedAuthUser.mockResolvedValue(staffAuthUser);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
  });

  it.each(routes)('%s returns 401 without a session', async (_n, route) => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);

    const res = await route.GET();

    expect(res.status).toBe(401);
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('playground');
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.google).not.toHaveBeenCalled();
  });

  it.each(routes)(
    '%s returns 403 for a non-staff account',
    async (_n, route) => {
      mocks.getVerifiedAuthUser.mockResolvedValue({
        ...staffAuthUser,
        email: 'person@example.com',
      });

      const res = await route.GET();

      expect(res.status).toBe(403);
      expect(mocks.generateObject).not.toHaveBeenCalled();
      expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
    }
  );

  it.each(routes)(
    '%s returns 403 when the staff account is not in the root workspace',
    async (_n, route) => {
      mocks.verifyWorkspaceMembershipType.mockResolvedValue({
        error: 'membership_missing',
        ok: false,
      });

      const res = await route.GET();

      expect(res.status).toBe(403);
      expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
        requiredType: 'ANY',
        supabase: admin,
        userId: 'user-1',
        wsId: ROOT_WORKSPACE_ID,
      });
      expect(mocks.generateObject).not.toHaveBeenCalled();
    }
  );

  it('object-generation returns the generated tasks for staff without writing memory', async () => {
    const res = await objectGeneration.GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(generated);
    expect(mocks.google).toHaveBeenCalledWith('gemini-2.5-flash-lite');
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    const [call] = mocks.generateObject.mock.calls[0] ?? [];
    expect(call.model).toEqual({ id: 'fake-model' });
    expect(call).not.toHaveProperty('tools');
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
  });

  it('tool-calling returns an empty object for staff', async () => {
    const res = await toolCalling.GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({});
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
