import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTasksAppOriginClient } from './tasks-app-url-client';

describe('getTasksAppOriginClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('preserves the Portless proxy port for local satellite links', () => {
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TUDO_APP_URL', '');
    vi.stubGlobal('window', {
      location: {
        hostname: 'tuturuuu.localhost',
        port: '1355',
        protocol: 'https:',
      },
    });

    expect(getTasksAppOriginClient()).toBe(
      'https://tasks.tuturuuu.localhost:1355'
    );
  });

  it('keeps the standard local Tasks origin when Portless has no explicit port', () => {
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TUDO_APP_URL', '');
    vi.stubGlobal('window', {
      location: {
        hostname: 'tuturuuu.localhost',
        port: '',
        protocol: 'https:',
      },
    });

    expect(getTasksAppOriginClient()).toBe('https://tasks.tuturuuu.localhost');
  });
});
