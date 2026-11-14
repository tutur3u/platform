import { describe, expect, it } from 'vitest';
import {
  getConfiguredOriginHostnames,
  resolveTrustedForwardedHost,
} from './forwarded-host';

describe('getConfiguredOriginHostnames', () => {
  it('collects *_APP_URL and explicit origin variables only', () => {
    expect(
      getConfiguredOriginHostnames({
        CALENDAR_APP_URL: 'https://calendar.tuturuuu.com/',
        NEXT_PUBLIC_WEB_APP_URL: 'https://TUTURUUU.com',
        BASE_URL: 'https://drive.tuturuuu.com',
        PORTLESS_URL: 'https://tuturuuu.localhost:1355',
        VERCEL_URL: 'tuturuuu-git-main.vercel.app',
        SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_DOCS_URL: 'https://docs.example',
        BAD_APP_URL: 'javascript:alert(1)',
      })
    ).toEqual(
      new Set([
        'calendar.tuturuuu.com',
        'tuturuuu.com',
        'drive.tuturuuu.com',
        'tuturuuu.localhost',
        'tuturuuu-git-main.vercel.app',
      ])
    );
  });
});

describe('resolveTrustedForwardedHost (SR-XFH-RETURN)', () => {
  const env = {
    PORTLESS_URL: 'https://tuturuuu.localhost:1355',
    TASKS_APP_URL: 'https://tasks.tuturuuu.com',
  };

  it('keeps a configured forwarded host verbatim, port included', () => {
    expect(resolveTrustedForwardedHost('tuturuuu.localhost:1355', env)).toBe(
      'tuturuuu.localhost:1355'
    );
    expect(
      resolveTrustedForwardedHost('Tasks.tuturuuu.com, evil.example', env)
    ).toBe('Tasks.tuturuuu.com');
  });

  it('ignores an unconfigured client forwarded host', () => {
    expect(resolveTrustedForwardedHost('evil.example', env)).toBe(null);
    expect(resolveTrustedForwardedHost('mail.tuturuuu.com', env)).toBe(null);
    expect(
      resolveTrustedForwardedHost('evil.example, tasks.tuturuuu.com', env)
    ).toBe(null);
    expect(resolveTrustedForwardedHost('tasks.tuturuuu.com', {})).toBe(null);
  });

  it.each([
    'tasks.tuturuuu.com/path',
    'evil.example@tasks.tuturuuu.com',
    'tasks.tuturuuu.com\r\nset-cookie: x=y',
    'tasks.tuturuuu.com:99999',
    'tasks tuturuuu.com',
    '',
    null,
  ])('rejects malformed forwarded host %j', (value) => {
    expect(resolveTrustedForwardedHost(value, env)).toBe(null);
  });
});
