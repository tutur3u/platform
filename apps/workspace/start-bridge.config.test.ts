import { describe, expect, it } from 'vitest';
import config, {
  DEFAULT_WEB_API_ORIGIN,
  resolveWebApiOrigin,
  selectWorkspaceApiOrigin,
  WEB_API_HOSTS,
} from './start-bridge.config';

describe('resolveWebApiOrigin', () => {
  it('keeps the production Web origin when INTERNAL_WEB_API_ORIGIN is unset', () => {
    expect(resolveWebApiOrigin({})).toBe(DEFAULT_WEB_API_ORIGIN);
    expect(DEFAULT_WEB_API_ORIGIN).toBe('https://tuturuuu.com');
  });

  it.each([
    ...WEB_API_HOSTS.map((host) => `https://${host}`),
    'https://tuturuuu.com/',
    'https://TUTURUUU.COM',
  ])('accepts the known Web origin %s', (origin) => {
    expect(resolveWebApiOrigin({ INTERNAL_WEB_API_ORIGIN: origin })).toBe(
      new URL(origin).origin
    );
  });

  it.each([
    ['plain http', 'http://tuturuuu.com'],
    ['a satellite host', 'https://workspace.tuturuuu.com'],
    ['a lookalike suffix', 'https://tuturuuu.com.evil.example'],
    ['a lookalike prefix', 'https://eviltuturuuu.com'],
    ['an attacker host', 'https://central.invalid'],
    ['a port', 'https://tuturuuu.com:8443'],
    ['credentials', 'https://user:pass@tuturuuu.com'],
    ['credentials hiding the host', 'https://tuturuuu.com@evil.example'],
    ['a path', 'https://tuturuuu.com/api'],
    ['a query', 'https://tuturuuu.com/?next=1'],
    ['a fragment', 'https://tuturuuu.com/#x'],
    ['an empty value', ''],
    ['a blank value', '   '],
    ['a non-URL', 'tuturuuu.com'],
    ['a loopback http origin', 'http://127.0.0.1:7803'],
  ])('fails closed on %s', (_label, origin) => {
    expect(() =>
      resolveWebApiOrigin({ INTERNAL_WEB_API_ORIGIN: origin })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
  });

  it('admits an extra https Web host named in TUTURUUU_WEB_API_HOSTS', () => {
    const env = {
      INTERNAL_WEB_API_ORIGIN: 'https://web-staging.example.com',
      TUTURUUU_WEB_API_HOSTS: ' Web-Staging.Example.com , other.example.com ',
    };

    expect(resolveWebApiOrigin(env)).toBe('https://web-staging.example.com');
    expect(
      resolveWebApiOrigin({
        ...env,
        INTERNAL_WEB_API_ORIGIN: 'https://other.example.com',
      })
    ).toBe('https://other.example.com');
  });

  it('keeps https mandatory and ignores malformed allowlist entries', () => {
    expect(() =>
      resolveWebApiOrigin({
        INTERNAL_WEB_API_ORIGIN: 'http://web-staging.example.com',
        TUTURUUU_WEB_API_HOSTS: 'web-staging.example.com',
      })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
    for (const entry of [
      '*',
      '*.example.com',
      'localhost',
      'a b.example.com',
    ]) {
      expect(() =>
        resolveWebApiOrigin({
          INTERNAL_WEB_API_ORIGIN: 'https://evil.example.com',
          TUTURUUU_WEB_API_HOSTS: entry,
        })
      ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
    }
  });

  it('does not treat the allowlist as a way to reach an unlisted host', () => {
    expect(() =>
      resolveWebApiOrigin({
        INTERNAL_WEB_API_ORIGIN: 'https://evil.example.com',
        TUTURUUU_WEB_API_HOSTS: 'web-staging.example.com',
      })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
  });
});

describe('workspace start-bridge config', () => {
  it('resolves the /api forward origin through the same assertion', () => {
    const request = new Request('https://workspace.tuturuuu.com/api/v1/x');
    const context = { path: '/api/v1/x' };

    expect(config.apiOrigin).toBe(selectWorkspaceApiOrigin);
    expect(selectWorkspaceApiOrigin(request, { ...context, env: {} })).toBe(
      DEFAULT_WEB_API_ORIGIN
    );
    expect(() =>
      selectWorkspaceApiOrigin(request, {
        ...context,
        env: { INTERNAL_WEB_API_ORIGIN: 'https://central.invalid' },
      })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
  });

  it('rejects unknown hosts instead of serving the canonical root', () => {
    expect(config.mounts?.unknownHost).toBe('reject');
  });
});
