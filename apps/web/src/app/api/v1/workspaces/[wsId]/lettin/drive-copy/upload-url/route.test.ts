import '../copy-auth.test-fixture';
import { uploadLettinNotebookDriveCopy } from '@tuturuuu/internal-api/lettin';
import { expect, it } from 'vitest';
import {
  actorId,
  expiredToken,
  mocks,
  params,
  request,
  uploadBody,
  workspaceId,
} from '../copy-auth.test-fixture';
import { POST as finalizePOST } from '../finalize-upload/route';
import { POST } from './route';

it('accepts a real signed Lettin session and authorized workspace Drive copy', async () => {
  const response = await POST(request('upload-url', uploadBody), params);
  expect(response.status).toBe(200);
  expect(mocks.permissions).toHaveBeenCalledWith(
    expect.objectContaining({
      user: expect.objectContaining({ id: actorId }),
      wsId: workspaceId,
    })
  );
  expect(mocks.upload).toHaveBeenCalledWith(workspaceId, uploadBody.filename, {
    path: 'Lettin',
    upsert: false,
    contentType: 'application/json',
    size: 5,
  });
  expect(mocks.supabaseFallback).not.toHaveBeenCalled();
});
it.each(['drive', 'finance', 'platform', 'calendar'] as const)(
  'rejects signed %s sessions without provider access',
  async (target) => {
    expect(
      (await POST(request('upload-url', uploadBody, target), params)).status
    ).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
  }
);
it('rejects missing or tampered JWTs before workspace/provider access', async () => {
  for (const token of ['', 'bad.jwt.signature']) {
    expect(
      (await POST(request('upload-url', uploadBody, 'lettin', token), params))
        .status
    ).toBe(401);
  }
  expect(mocks.upload).not.toHaveBeenCalled();
});
it.each(['membership', 'permission', 'workspace', 'actor'])(
  'denies %s before signing a URL',
  async (reason) => {
    if (reason === 'membership') mocks.member = false;
    if (reason === 'permission') mocks.manage = false;
    const p =
      reason === 'workspace'
        ? { params: Promise.resolve({ wsId: 'foreign' }) }
        : params;
    const body =
      reason === 'actor'
        ? { ...uploadBody, expectedActor: workspaceId }
        : uploadBody;
    const response = await POST(request('upload-url', body), p);
    expect([401, 403, 409]).toContain(response.status);
    expect(mocks.upload).not.toHaveBeenCalled();
  }
);
it.each([
  { path: '../private' },
  { path: 'external-projects/project' },
  { upsert: true },
  { contentType: 'application/zip' },
  { size: 0 },
  { size: 10485761 },
  { filename: '../file.json' },
  { filename: 'other.json' },
  { unexpected: true },
])('rejects an unscoped payload %j before storage', async (delta) => {
  expect(
    (await POST(request('upload-url', { ...uploadBody, ...delta }), params))
      .status
  ).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('rejects expired signed Lettin sessions without falling back to Supabase', async () => {
  expect(
    (
      await POST(
        request('upload-url', uploadBody, 'lettin', expiredToken()),
        params
      )
    ).status
  ).toBe(401);
  expect(mocks.supabaseFallback).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('runs the real canonical client through both real signed-session handlers', async () => {
  let puts = 0;
  const transport: typeof fetch = async (input, init) => {
    if (init?.method === 'PUT') {
      puts += 1;
      return new Response(null, { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    return String(input).endsWith('/upload-url')
      ? POST(request('upload-url', body), params)
      : finalizePOST(request('finalize-upload', body), params);
  };
  const file = new File(['{}'], uploadBody.filename, {
    type: 'application/json',
  });
  const result = await uploadLettinNotebookDriveCopy(
    workspaceId,
    actorId,
    file,
    { fetch: transport }
  );
  expect(result.finalize?.success).toBe(true);
  expect(puts).toBe(1);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.finalize).toHaveBeenCalledTimes(1);
});
