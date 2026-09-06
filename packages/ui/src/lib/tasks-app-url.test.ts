import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTaskApiUrl, getTasksAppUrl } from './tasks-app-url';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Calendar task API routing', () => {
  it.each(['calendar.tuturuuu.com', 'calendar.tuturuuu.localhost'])(
    'uses the local authenticated proxy on %s',
    (hostname) => {
      vi.stubGlobal('window', {
        location: { hostname, protocol: 'https:', port: '' },
      });
      vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', 'https://tasks.tuturuuu.com');
      expect(getTaskApiUrl('/api/v1/workspaces/ws/tasks/journal')).toBe(
        '/api/v1/workspaces/ws/tasks/journal'
      );
      expect(getTasksAppUrl('/personal/tasks')).toBe(
        'https://tasks.tuturuuu.com/personal/tasks'
      );
    }
  );
});
