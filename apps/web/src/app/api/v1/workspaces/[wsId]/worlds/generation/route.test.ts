import { beforeEach, expect, test, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  permissions: vi.fn(),
  generate: vi.fn(),
  consent: vi.fn(),
}));

vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: 'synthetic-policy',
  lookupAiDataConsent: mocks.consent,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({ createClient: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.authenticate,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@/lib/worlds/generation/runtime', () => ({
  generateWorldDraft: mocks.generate,
}));

const worldId = '35eaaf0b-0704-4cb6-878b-1fd5d18f72ba';
const requestId = '0a95f426-4d77-4467-95db-e3acae934d36';
const context = { params: Promise.resolve({ wsId: 'personal' }) };
const input = { worldId, requestId, instruction: 'Add a stage' };

function request(body: unknown) {
  return new Request('https://example.test/generation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue({ user: { id: 'actor' } });
  mocks.permissions.mockResolvedValue({
    wsId: 'resolved-workspace',
    containsPermission: (permission: string) =>
      permission === 'manage_workspace_settings',
  });
  mocks.generate.mockResolvedValue({ status: 'ok', draft: {} });
});

test('refuses a native draft without Mira AI data consent', async () => {
  mocks.consent.mockResolvedValue(false);
  const incoming = new Request('https://example.test/generation', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer native-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const response = await POST(incoming, context);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'ai_consent_required' });
  expect(mocks.consent).toHaveBeenCalledWith('actor', undefined);
  expect(mocks.generate).not.toHaveBeenCalled();
});

test('denies generation when workspace permissions are absent', async () => {
  mocks.permissions.mockResolvedValue(null);
  expect((await POST(request(input), context)).status).toBe(403);
  expect(mocks.generate).not.toHaveBeenCalled();
});

test('rejects stored asset references and client-supplied workspace identity', async () => {
  expect(
    (await POST(request({ ...input, workspaceId: 'other' }), context)).status
  ).toBe(400);
  expect(
    (
      await POST(
        request({ ...input, attachment: { id: 'private-upload' } }),
        context
      )
    ).status
  ).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
});

test('passes the authenticated scope and only the bytes supplied by this request', async () => {
  const incoming = request({
    ...input,
    attachment: { mediaType: 'text/plain', data: 'aGk=' },
  });
  const response = await POST(incoming, context);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.permissions).toHaveBeenCalledWith({
    wsId: 'personal',
    user: { id: 'actor' },
  });
  expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
    { workspaceId: 'resolved-workspace', actorId: 'actor', worldId },
    {
      ...input,
      workspaceId: 'resolved-workspace',
      kind: 'file',
      source: { id: requestId, mediaType: 'text/plain', byteLength: 2 },
    },
    incoming.signal,
    Buffer.from('hi')
  );
});
