import { afterEach, describe, expect, it } from 'vitest';
import { appApiPath } from './mounted-api';

const baseGlobal = globalThis as { __tuturuuuAppBase?: string };

afterEach(() => {
  delete baseGlobal.__tuturuuuAppBase;
});

describe('infrastructure mounted API paths', () => {
  it('prefixes admin routes under /admin and keeps the query', () => {
    baseGlobal.__tuturuuuAppBase = '/admin';
    expect(appApiPath('/api/v1/admin/ai-credits/models?query=fast')).toBe(
      '/admin/api/v1/admin/ai-credits/models?query=fast'
    );
    expect(appApiPath('/api/v1/infrastructure/changelog')).toBe(
      '/admin/api/v1/infrastructure/changelog'
    );
    expect(appApiPath('/api/v1/infrastructure/timezones')).toBe(
      '/admin/api/v1/infrastructure/timezones'
    );
    expect(appApiPath('/api/v1/internal/holidays')).toBe(
      '/admin/api/v1/internal/holidays'
    );
    expect(appApiPath('/api/v1/infrastructure/blocked-ips')).toBe(
      '/admin/api/v1/infrastructure/blocked-ips'
    );
    expect(appApiPath('/api/v1/infrastructure/otp-limits/reset')).toBe(
      '/admin/api/v1/infrastructure/otp-limits/reset'
    );
    expect(appApiPath('/api/ai/translate')).toBe('/admin/api/ai/translate');
    expect(appApiPath('/api/workspaces')).toBe('/admin/api/workspaces');
    expect(appApiPath('/api/workspaces/ws/secrets/secret-1')).toBe(
      '/admin/api/workspaces/ws/secrets/secret-1'
    );
    expect(
      appApiPath(
        '/api/v1/workspaces/ws/infrastructure/realtime/analytics?range=day'
      )
    ).toBe(
      '/admin/api/v1/workspaces/ws/infrastructure/realtime/analytics?range=day'
    );
  });

  it('leaves the ownerless calendar export and centralFirst Web routes at the root', () => {
    baseGlobal.__tuturuuuAppBase = '/admin';
    expect(
      appApiPath('/api/v1/workspaces/ws/calendar-sync/export?format=csv')
    ).toBe('/api/v1/workspaces/ws/calendar-sync/export?format=csv');
    expect(appApiPath('/api/workspaces/invitations')).toBe(
      '/api/workspaces/invitations'
    );
    expect(appApiPath('/api/v1/workspaces/ws/settings/permissions')).toBe(
      '/api/v1/workspaces/ws/settings/permissions'
    );
  });
});
