import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createWorkspaceRouteHandlers } from './workspace-route-group';

describe('grouped workspace wrappers', () => {
  const handlers = createWorkspaceRouteHandlers([
    [
      ['[keyId]'],
      {
        DELETE: async (
          _request,
          context: { params: Promise<{ wsId: string; keyId: string }> }
        ) => Response.json(await context.params),
      },
    ],
    [['roles'], { POST: () => new Response('static') }],
  ]);

  const context = (segment: string) => ({
    params: Promise.resolve({ wsId: 'workspace', segments: [segment] }),
  });
  const request = (segment: string) =>
    new NextRequest(
      `https://tuturuuu.com/api/v1/workspaces/workspace/api-keys/${segment}`
    );

  it('keeps a literal route ahead of a dynamic route even for unsupported methods', async () => {
    expect(
      (await handlers.DELETE(request('roles'), context('roles')))?.status
    ).toBe(405);
    const options = await handlers.OPTIONS(request('roles'), context('roles'));
    expect(options?.status).toBe(204);
    expect(options?.headers.get('Allow')).toBe('OPTIONS, POST');
  });

  it('returns 404 when the path prefix or segment count differs', async () => {
    const wrongPrefix = new NextRequest(
      'https://tuturuuu.com/alternate/api/v1/workspaces/workspace/api-keys/key'
    );
    expect((await handlers.DELETE(wrongPrefix, context('key')))?.status).toBe(
      404
    );
    expect(
      (await handlers.DELETE(request('key/extra'), context('key')))?.status
    ).toBe(404);
  });

  it('passes decoded parameters and keeps encoded literals on the dynamic route', async () => {
    const response = await handlers.DELETE(
      request('%72oles'),
      context('roles')
    );
    expect(await response?.json()).toEqual({
      wsId: 'workspace',
      keyId: 'roles',
    });
  });
});
