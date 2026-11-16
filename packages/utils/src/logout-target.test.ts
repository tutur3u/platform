import { describe, expect, it } from 'vitest';
import {
  createLogoutConfirmationUrl,
  resolveLogoutTarget,
} from './logout-target';

const centralOrigin = 'https://tuturuuu.com';

describe('logout confirmation targets', () => {
  it('uses a registered app origin and a registry-owned display name', () => {
    expect(
      resolveLogoutTarget({
        appUrl: 'https://tasks.tuturuuu.com',
        centralOrigin,
      })
    ).toEqual({
      name: 'Tasks',
      origin: 'https://tasks.tuturuuu.com',
    });
  });

  it.each([
    undefined,
    'https://attacker.example',
    'javascript:alert(1)',
    'https://tasks.tuturuuu.com.attacker.example',
    'https://tasks.tuturuuu.com@attacker.example',
    'https://tasks.tuturuuu.com/private',
    'https://tasks.tuturuuu.com/?next=https://attacker.example',
    'https://tuturuuu.com',
    'https://docs.tuturuuu.com',
    'https://tasks.tuturuuu.com/#fragment',
  ])('does not offer app-only logout for %s', (appUrl) => {
    expect(resolveLogoutTarget({ appUrl, centralOrigin })).toBeNull();
  });

  it('does not promise cookie isolation across localhost ports', () => {
    expect(
      resolveLogoutTarget({
        appUrl: 'http://localhost:7806',
        centralOrigin: 'http://localhost:7803',
      })
    ).toBeNull();
  });

  it('asks first in the selected language without any mutation capability', () => {
    const url = new URL(
      createLogoutConfirmationUrl({
        centralUrl: centralOrigin,
        appOrigin: 'https://tasks.tuturuuu.com',
        locale: 'vi',
      })
    );
    expect(url.pathname).toBe('/vi/logout');
    expect([...url.searchParams.entries()]).toEqual([
      ['appUrl', 'https://tasks.tuturuuu.com'],
    ]);
  });
});
