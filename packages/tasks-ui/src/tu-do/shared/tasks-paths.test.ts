import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tasksApiPath, withDocumentAppBase } from './tasks-paths';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});

function register(app: string, base: string) {
  const resolver = Object.assign(
    (path: string) =>
      path.includes('/task-boards') || path.includes('/habits')
        ? `${base}${path}`
        : path,
    { owns: (path: string) => path.includes('/task-boards') }
  );
  cleanups.push(registerDefaultAppBaseResolver(resolver, { app }));
}

describe('tasksApiPath', () => {
  it('resolves Tasks-owned paths under the mount inside Tasks', () => {
    register('tasks', '/tasks');
    expect(tasksApiPath('/api/v1/workspaces/w/task-boards')).toBe(
      '/tasks/api/v1/workspaces/w/task-boards'
    );
    expect(tasksApiPath('/api/v1/workspaces/w/members')).toBe(
      '/api/v1/workspaces/w/members'
    );
  });

  it('leaves paths unchanged in another app (Web)', () => {
    register('web', '/web');
    expect(tasksApiPath('/api/v1/workspaces/w/task-boards')).toBe(
      '/api/v1/workspaces/w/task-boards'
    );
  });

  it('leaves paths unchanged with no resolver', () => {
    expect(tasksApiPath('/api/v1/x')).toBe('/api/v1/x');
  });
});

describe('withDocumentAppBase', () => {
  it('prefixes the mounted document base once', () => {
    vi.stubGlobal('__tuturuuuAppBase', '/tasks');
    expect(withDocumentAppBase('/ws/tasks/1')).toBe('/tasks/ws/tasks/1');
    expect(withDocumentAppBase('/tasks/ws')).toBe('/tasks/ws');
    expect(withDocumentAppBase('/')).toBe('/tasks');
    expect(withDocumentAppBase('//evil.example')).toBe('//evil.example');
    expect(withDocumentAppBase('https://x.test/a')).toBe('https://x.test/a');
  });

  it('is the identity at a host root', () => {
    vi.stubGlobal('__tuturuuuAppBase', '');
    expect(withDocumentAppBase('/ws/tasks/1')).toBe('/ws/tasks/1');
    vi.stubGlobal('__tuturuuuAppBase', undefined);
    expect(withDocumentAppBase('/ws/tasks/1')).toBe('/ws/tasks/1');
  });
});
