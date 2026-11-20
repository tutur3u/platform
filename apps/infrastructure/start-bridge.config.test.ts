import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { describe, expect, it } from 'vitest';
import bridgeConfig from './start-bridge.config';

const mounts = { app: 'infrastructure', rootHosts: [], ...bridgeConfig.mounts };
const resolve = (url: string) => resolveAppBase(new URL(url), mounts);

describe('Admin start-bridge mounts', () => {
  it('owns only /admin on the platform apex and keeps the legacy host at root', () => {
    expect(resolve('https://tuturuuu.com/admin')).toEqual({
      mode: 'mounted',
      basePath: '/admin',
    });
    expect(resolve('https://tuturuuu.com/admin/vi/root')).toEqual({
      mode: 'mounted',
      basePath: '/admin',
    });
    expect(resolve('https://tuturuuu.com/admin-team')).toBeNull();
    expect(resolve('https://tuturuuu.com/infra')).toBeNull();
    expect(resolve('https://infrastructure.tuturuuu.com/root')).toEqual({
      mode: 'root',
      basePath: '',
    });
    expect(resolve('https://unknown-host.invalid/admin')).toBeNull();
  });

  it('isolates mounted requests to the app-owned locale cookie', () => {
    expect(bridgeConfig.mounts?.isolation).toEqual({
      ownedCookies: ['NEXT_LOCALE'],
    });
  });
});
