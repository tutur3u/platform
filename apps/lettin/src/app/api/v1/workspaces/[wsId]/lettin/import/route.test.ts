import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  bindings: vi.fn(),
  access: vi.fn(),
  build: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
}));
vi.mock('@/server/identity', () => ({ resolveActor: mocks.actor }));
vi.mock('@/server/bindings', () => ({ bindings: mocks.bindings }));
vi.mock('@/server/notebook-import', () => ({
  requireNotebookImportAccess: mocks.access,
  buildNotebookImportPlan: mocks.build,
  applyNotebookImport: mocks.apply,
}));
vi.mock('@/server/import-store', () => ({ previewImport: mocks.preview }));

import { LettinError } from '@/server/context';
import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000000001',
  id = '00000000-0000-4000-8000-000000000002',
  url = 'https://lettin.tuturuuu.com/api/v1/workspaces/personal/lettin/import';
const context = { params: Promise.resolve({ wsId: 'personal' }) };
function request(body: unknown, origin = 'https://lettin.tuturuuu.com') {
  return new Request(url, {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify(body),
  });
}
const preview = {
  action: 'preview',
  expectedActor: actor,
  consent: true,
  title: 'Copy',
  payload: { format: 'lettin-notebook' },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: actor, wsId: 'destination' });
  mocks.bindings.mockResolvedValue({ db: 'db' });
  mocks.access.mockResolvedValue(undefined);
  mocks.build.mockReturnValue('plan');
  mocks.preview.mockResolvedValue({ id });
  mocks.apply.mockResolvedValue({ id });
});
it('requires consent and destination actor before storing a private preview', async () => {
  const response = await POST(request(preview), context);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.actor).toHaveBeenCalledWith('personal');
  expect(mocks.build).toHaveBeenCalledWith(preview.payload, 'Copy');
  expect(mocks.preview).toHaveBeenCalledWith(
    'db',
    { id: actor, wsId: 'destination' },
    'plan'
  );
});
it('applies only an explicitly approved actor-bound preview', async () => {
  expect(
    (
      await POST(
        request({
          action: 'apply',
          expectedActor: actor,
          previewId: id,
          consent: true,
        }),
        context
      )
    ).status
  ).toBe(200);
  expect(mocks.apply).toHaveBeenCalledWith(
    'db',
    { id: actor, wsId: 'destination' },
    id
  );
});
it.each([
  { ...preview, consent: false },
  { ...preview, expectedActor: 'bad' },
  { ...preview, extra: true },
  { action: 'apply', expectedActor: actor, previewId: id },
])('rejects unchecked import commands', async (body) => {
  expect((await POST(request(body), context)).status).toBe(400);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('blocks cross-origin calls and account changes before resolving storage', async () => {
  expect(
    (await POST(request(preview, 'https://example.com'), context)).status
  ).toBe(403);
  expect(
    (await POST(request({ ...preview, expectedActor: id }), context)).status
  ).toBe(409);
  expect(mocks.bindings).not.toHaveBeenCalled();
});
it('preserves creator authorization and malformed/oversized request failures', async () => {
  mocks.access.mockRejectedValue(new LettinError(403));
  expect((await POST(request(preview), context)).status).toBe(403);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(
    (
      await POST(
        new Request(url, {
          method: 'POST',
          headers: { origin: 'https://lettin.tuturuuu.com' },
          body: '{',
        }),
        context
      )
    ).status
  ).toBe(400);
  expect(
    (await POST(request('x'.repeat(11 * 1024 * 1024)), context)).status
  ).toBe(413);
});
