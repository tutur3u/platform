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

describe('Tasks URLs on the tuturuuu.com/tasks mount', () => {
  const at = (hostname: string, appBase?: string) => {
    vi.stubGlobal('window', {
      location: { hostname, protocol: 'https:', port: '' },
    });
    vi.stubGlobal('__tuturuuuAppBase', appBase);
  };

  it('stays same-origin under /tasks inside mounted Tasks, even when a host is configured', () => {
    at('tuturuuu.com', '/tasks');
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', 'https://tasks.tuturuuu.com');
    expect(getTasksAppUrl('/personal/tasks')).toBe('/tasks/personal/tasks');
    expect(getTasksAppUrl('/')).toBe('/tasks');
    expect(getTaskApiUrl('/api/v1/workspaces/ws/task-boards?x=1')).toBe(
      '/tasks/api/v1/workspaces/ws/task-boards?x=1'
    );
  });

  it('keeps today’s subdomain URLs from Web while the mount is inactive', () => {
    at('tuturuuu.com', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', 'https://tasks.tuturuuu.com');
    expect(getTasksAppUrl('/personal/tasks')).toBe(
      'https://tasks.tuturuuu.com/personal/tasks'
    );
  });

  it('links Web to https://tuturuuu.com/tasks once the mount is active', () => {
    at('tuturuuu.com', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tasks');
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', 'https://tasks.tuturuuu.com');
    expect(getTasksAppUrl('/personal/tasks')).toBe(
      'https://tuturuuu.com/tasks/personal/tasks'
    );
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', '');
    expect(getTasksAppUrl('/personal/tasks/')).toBe(
      'https://tuturuuu.com/tasks/personal/tasks'
    );
  });

  it('never treats another mounted app as Tasks', () => {
    at('tuturuuu.com', '/calendar');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', '');
    expect(getTasksAppUrl('/x')).toBe('https://tasks.tuturuuu.com/x');
  });
});
