import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  generateObject: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getVerifiedAuthUser: vi.fn(),
  google: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: unknown[]) => mocks.google(...args),
}));
vi.mock('@tuturuuu/ai/core', () => ({
  generateObject: (...args: unknown[]) => mocks.generateObject(...args),
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

const objectGeneration = await import('./ai/object-generation/route');
const toolCalling = await import('./ai/tool-calling/route');
const buildInfo = await import('./build-info/route');
const admin = { id: 'admin-client' };
const staffAuthUser = {
  email: 'person@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  id: 'user-1',
  identities: [{ identity_data: {}, provider: 'email' }],
};

const HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

describe('playground API route contracts', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.google.mockReturnValue({ id: 'fake-model' });
    mocks.getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
    mocks.getVerifiedAuthUser.mockResolvedValue(staffAuthUser);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
  });

  it.each([
    ['object-generation', objectGeneration],
    ['tool-calling', toolCalling],
    ['build-info', buildInfo],
  ])('%s exposes only GET', (_name, mod) => {
    expect(typeof mod.GET).toBe('function');
    for (const method of HTTP_METHODS) {
      expect(mod).not.toHaveProperty(method);
    }
  });

  it('tool-calling returns an empty JSON object for staff without side effects', async () => {
    const res = await toolCalling.GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({});
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('build-info returns uncached JSON for the playground app', async () => {
    const res = buildInfo.GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(res.headers.get('cache-control')).toBe('no-store, max-age=0');
    const body = await res.json();
    expect(body).toEqual(expect.any(Object));
    expect(JSON.stringify(body)).not.toMatch(/SECRET|PRIVATE_KEY|TOKEN=/i);
  });

  it('object-generation takes no request input and runs a fixed server prompt for staff without memory', async () => {
    expect(objectGeneration.GET.length).toBe(0);

    const model = { id: 'fake-model' };
    mocks.google.mockReturnValue(model);
    mocks.generateObject.mockResolvedValue({
      object: { tasks: [{ internalReasoning: 'fake reasoning', name: 'x' }] },
    });

    const res = await objectGeneration.GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      tasks: [{ internalReasoning: 'fake reasoning', name: 'x' }],
    });
    expect(mocks.google).toHaveBeenCalledWith('gemini-2.5-flash-lite');
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    const [call] = mocks.generateObject.mock.calls[0] ?? [];
    expect(call.model).toBe(model);
    expect(call.prompt).toEqual(expect.any(String));
    expect(call.system).toEqual(expect.any(String));
    expect(call).not.toHaveProperty('tools');
  });

  it('object-generation validates model output against the task schema', async () => {
    mocks.google.mockReturnValue({});
    mocks.generateObject.mockResolvedValue({ object: { tasks: [] } });

    await objectGeneration.GET();

    const [call] = mocks.generateObject.mock.calls[0] ?? [];
    const schema = call.schema;
    expect(
      schema.safeParse({
        tasks: [{ internalReasoning: 'long enough', name: 'ok', type: 'task' }],
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        tasks: [{ internalReasoning: 'short', name: 'ok', type: 'shell' }],
      }).success
    ).toBe(false);
  });

  it('object-generation surfaces provider failures as errors', async () => {
    mocks.google.mockReturnValue({});
    mocks.generateObject.mockRejectedValue(new Error('provider unavailable'));

    await expect(objectGeneration.GET()).rejects.toThrow(
      'provider unavailable'
    );
  });
});
