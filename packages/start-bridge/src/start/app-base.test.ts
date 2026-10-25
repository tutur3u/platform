import { describe, expect, it } from 'vitest';
import { withBridgeRequest } from '../server/request-context';
import { createAppBaseResolver } from './app-base';

const resolve = createAppBaseResolver(
  ['/api/v1/workspaces/[wsId]/products', '/api/health'],
  ['/api/v1/workspaces/:wsId/settings/permissions']
);

describe('createAppBaseResolver', () => {
  it('mounts app-owned paths in the browser and leaves Web paths alone', () => {
    expect(resolve('/api/health?x=1')).toBe('/api/health?x=1');
    expect(resolve('/api/v1/users/me')).toBe('/api/v1/users/me');
  });

  it('addresses the incoming host per request on the server', async () => {
    const mounted = await withBridgeRequest(
      {
        request: new Request('https://tuturuuu.com/inventory/en'),
        appBase: '/inventory',
      },
      async () => resolve('/api/v1/workspaces/w1/products?q=a')
    );
    expect(mounted).toBe(
      'https://tuturuuu.com/inventory/api/v1/workspaces/w1/products?q=a'
    );
    const root = await withBridgeRequest(
      { request: new Request('https://inventory.tuturuuu.com/en') },
      async () => resolve('/api/health')
    );
    expect(root).toBe('https://inventory.tuturuuu.com/api/health');
  });

  it('keeps centralFirst and unowned paths on Web', async () => {
    await withBridgeRequest(
      {
        request: new Request('https://tuturuuu.com/inventory/en'),
        appBase: '/inventory',
      },
      async () => {
        expect(resolve('/api/v1/workspaces/w1/settings/permissions')).toBe(
          '/api/v1/workspaces/w1/settings/permissions'
        );
        expect(resolve('/api/v1/users/me')).toBe('/api/v1/users/me');
      }
    );
  });
});
