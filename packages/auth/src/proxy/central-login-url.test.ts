import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCentralizedReturnUrl,
  buildCentralLoginUrl,
} from './central-login-url';
import { normalizeAuthRedirectPath } from './redirect-path';

const CENTRAL = 'https://tuturuuu.com';
const TASKS = 'https://tasks.tuturuuu.com';
const MAIL = 'https://mail.tuturuuu.com';
const BOARD = 'a1b2c3d4-0000-4000-8000-000000000001';

function requestFor(origin: string, pathAndQuery: string) {
  return new NextRequest(`${origin}${pathAndQuery}`);
}

describe('central login return URL encoding', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_GATEWAY_ORIGIN_HOSTS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encodes the verify-token destination once for a Tasks board', () => {
    const verifyUrl = buildCentralizedReturnUrl(
      requestFor(TASKS, `/personal/boards/${BOARD}`),
      CENTRAL,
      [TASKS]
    );

    expect(verifyUrl).toBe(
      `${TASKS}/verify-token?nextUrl=%2Fpersonal%2Fboards%2F${BOARD}`
    );
    expect(verifyUrl).not.toContain('%25');
    expect(new URL(verifyUrl as string).searchParams.get('nextUrl')).toBe(
      `/personal/boards/${BOARD}`
    );
  });

  it('keeps a Mail ?source= destination at one inner and one outer encoding', () => {
    const request = requestFor(MAIL, '/personal/inbox?source=notification');
    const verifyUrl = buildCentralizedReturnUrl(request, CENTRAL, [MAIL]);

    expect(verifyUrl).toBe(
      `${MAIL}/verify-token?nextUrl=%2Fpersonal%2Finbox%3Fsource%3Dnotification`
    );
    expect(verifyUrl).not.toContain('%25');

    const loginUrl = buildCentralLoginUrl(request, CENTRAL, [MAIL]);
    const rawQuery = loginUrl.search;

    // The nested ? is %3F once inside the verify URL and %253F once more in the
    // login query; a third level would read %25253F.
    expect(rawQuery).toContain('%253Fsource%253Dnotification');
    expect(rawQuery).not.toContain('%25253F');
    expect(loginUrl.searchParams.get('returnUrl')).toBe(verifyUrl);
    const returned = new URL(loginUrl.searchParams.get('returnUrl') as string);
    expect(returned.searchParams.get('nextUrl')).toBe(
      '/personal/inbox?source=notification'
    );
  });

  it('builds the same verify URL from an encoded or a plain target path', () => {
    const plain = '/personal/inbox?source=notification';
    const request = requestFor(MAIL, '/personal/inbox');
    const build = (target: string) =>
      buildCentralizedReturnUrl(request, CENTRAL, [MAIL], target);
    const fromPlain = build(plain);

    expect(build(encodeURIComponent(plain))).toBe(fromPlain);
    expect(build(`/verify-token?nextUrl=${encodeURIComponent(plain)}`)).toBe(
      fromPlain
    );
  });

  it('unwraps repeated verify-token nesting to one destination', () => {
    const inner = `/personal/boards/${BOARD}?source=mail`;
    const nested = `/verify-token?nextUrl=${encodeURIComponent(
      `/login?returnUrl=${encodeURIComponent(
        `${TASKS}/verify-token?nextUrl=${encodeURIComponent(inner)}`
      )}`
    )}`;

    expect(normalizeAuthRedirectPath(nested, TASKS)).toBe(inner);
    expect(
      normalizeAuthRedirectPath(
        `/verify-token?nextUrl=${encodeURIComponent(inner)}`,
        TASKS
      )
    ).toBe(inner);
  });

  it('rejects third-party destinations at every encoding level', () => {
    const evil = 'https://evil.test/steal?x=1';

    for (const candidate of [
      evil,
      encodeURIComponent(evil),
      `/verify-token?nextUrl=${encodeURIComponent(evil)}`,
      `/login?returnUrl=${encodeURIComponent(evil)}`,
      `/login?next=${encodeURIComponent(encodeURIComponent(evil))}`,
      `//evil.test/steal`,
    ]) {
      expect(normalizeAuthRedirectPath(candidate, TASKS)).toBe('/');
    }

    expect(
      buildCentralizedReturnUrl(
        requestFor(TASKS, '/personal/boards'),
        CENTRAL,
        [TASKS],
        evil
      )
    ).toBe(`${TASKS}/verify-token?nextUrl=%2F`);
  });

  it('falls back to the canonical origin instead of reflecting the request host', () => {
    const loginUrl = buildCentralLoginUrl(
      requestFor('https://evil.test', '/personal/boards'),
      CENTRAL,
      [TASKS]
    );

    expect(loginUrl.searchParams.get('returnUrl')).toBe(
      `${TASKS}/verify-token?nextUrl=%2Fpersonal%2Fboards`
    );
  });
});
