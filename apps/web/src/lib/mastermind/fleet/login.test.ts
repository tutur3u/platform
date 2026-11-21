import { describe, expect, it } from 'vitest';
// The publisher mirrors the host allowlist so it can drop a bad file locally.
import {
  LOGIN_HOSTS,
  parseLogin,
} from '../../../../../../scripts/mastermind-fleet/decision-extras.mjs';
import { fleetDecisionSchema, fleetStateSchema } from './contract';
import {
  effectiveLoginState,
  FLEET_LOGIN_HOSTS,
  fleetLoginSchema,
  safeLoginUrl,
} from './login';
import { sampleFleetState } from './sample-state.fixture';

const githubDevice = {
  service: 'github',
  flow: 'device',
  state: 'waiting',
  url: 'https://github.com/login/device',
  userCode: '8f3k-q2mx',
  expiresAt: '2026-11-20T03:15:00.000Z',
  machineId: 'devbox',
};

describe('safeLoginUrl', () => {
  it.each([
    ['github', 'https://github.com/login/device', true],
    [
      'cloudflare',
      'https://dash.cloudflare.com/oauth2/auth?client_id=x&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Fcb',
      false,
    ],
    [
      'cloudflare',
      'https://dash.cloudflare.com/oauth2/auth?client_id=x&redirect_uri=https%3A%2F%2Fevil.example%2Fcb',
      false,
    ],
    [
      'cloudflare',
      'https://dash.cloudflare.com/oauth2/auth?client_id=x',
      false,
    ],
    ['github', 'https://github.com/login/device#frag', false],
    [
      'cloudflare',
      'https://dash.cloudflare.com/oauth2/auth?client_id=x&redirect_uri=http%3A%2F%2Flocalhost%2Fcb&redirect_uri=https%3A%2F%2Fevil.example%2Fcb',
      false,
    ],
    ['github', `https://github.com/login/${'\u00e9'.repeat(600)}`, false],
    ['claude', 'https://claude.ai/oauth/authorize?code=true', true],
    ['microsoft', 'https://login.microsoftonline.com/common/oauth2', true],
    ['github', 'http://github.com/login/device', false],
    ['github', 'https://github.com.evil.example/login/device', false],
    ['github', 'https://evilgithub.com/login/device', false],
    ['github', 'https://user:pw@github.com/login/device', false],
    ['github', 'https://github.com:8443/login/device', false],
    ['github', 'https://dash.cloudflare.com/', false],
    ['github', 'javascript:alert(1)', false],
    ['github', 'not a url', false],
  ] as const)('%s %s allowed=%s', (service, url, allowed) => {
    expect(safeLoginUrl(service, url) !== null).toBe(allowed);
  });

  it('accepts a loopback callback only for a local-callback flow', () => {
    const url =
      'https://dash.cloudflare.com/oauth2/auth?client_id=x&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Fcb';
    expect(safeLoginUrl('cloudflare', url, 'local_callback')).not.toBeNull();
    const login = {
      service: 'cloudflare',
      flow: 'local_callback',
      state: 'waiting',
      url,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    expect(fleetLoginSchema.safeParse(login).success).toBe(false);
    expect(
      fleetLoginSchema.safeParse({ ...login, machineId: 'macstudio1' }).success
    ).toBe(true);
  });

  it('matches the publisher mirror exactly', () => {
    expect(LOGIN_HOSTS).toEqual(FLEET_LOGIN_HOSTS);
  });
});

describe('fleetLoginSchema', () => {
  it('accepts a device request and normalizes the code', () => {
    const parsed = fleetLoginSchema.parse(githubDevice);
    expect(parsed.userCode).toBe('8F3K-Q2MX');
    expect(parsed.url).toBe('https://github.com/login/device');
  });

  it('needs an expiry within a day while open', () => {
    const { expiresAt: _expiresAt, ...noExpiry } = githubDevice;
    expect(fleetLoginSchema.safeParse(noExpiry).success).toBe(false);
    expect(
      fleetLoginSchema.safeParse({
        ...githubDevice,
        expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      }).success
    ).toBe(false);
  });

  it('refuses a query on device pages', () => {
    expect(
      fleetLoginSchema.safeParse({
        ...githubDevice,
        url: 'https://github.com/login/device?user_code=ABCD-1234',
      }).success
    ).toBe(false);
  });

  it('requires a code for device flow and refuses one elsewhere', () => {
    const { userCode: _code, ...noCode } = githubDevice;
    expect(fleetLoginSchema.safeParse(noCode).success).toBe(false);
    expect(
      fleetLoginSchema.safeParse({ ...githubDevice, flow: 'link' }).success
    ).toBe(false);
  });

  it('refuses a code that looks like a token', () => {
    expect(
      fleetLoginSchema.safeParse({
        ...githubDevice,
        userCode: 'ghp_abcdefghijklmnopqrstuvwxyz',
      }).success
    ).toBe(false);
  });

  it('keeps no link or code once terminal', () => {
    expect(
      fleetLoginSchema.safeParse({ ...githubDevice, state: 'verified' }).success
    ).toBe(false);
    expect(
      fleetLoginSchema.safeParse({
        service: 'github',
        flow: 'device',
        state: 'verified',
      }).success
    ).toBe(true);
  });

  it('refuses a host outside the service allowlist', () => {
    expect(
      fleetLoginSchema.safeParse({
        ...githubDevice,
        url: 'https://github.evil.example/login/device',
      }).success
    ).toBe(false);
  });

  it('reads a passed expiry as expired', () => {
    const now = new Date('2026-11-20T03:20:00.000Z');
    expect(effectiveLoginState(githubDevice as never, now)).toBe('expired');
    expect(
      effectiveLoginState(
        { state: 'verified', expiresAt: githubDevice.expiresAt },
        now
      )
    ).toBe('verified');
  });
});

describe('login decisions', () => {
  const base = {
    id: 'gh-devbox-login',
    title: 'GitHub sign-in on Devbox',
    urgency: 'high',
    createdAt: '2026-11-20T03:00:00.000Z',
  };

  it('pairs the login kind with its payload', () => {
    expect(
      fleetDecisionSchema.safeParse({
        ...base,
        kind: 'login',
        login: githubDevice,
      }).success
    ).toBe(true);
    expect(
      fleetDecisionSchema.safeParse({ ...base, kind: 'login' }).success
    ).toBe(false);
    expect(
      fleetDecisionSchema.safeParse({ ...base, login: githubDevice }).success
    ).toBe(false);
  });

  it('defaults kind to ask and scrubs the context fields', () => {
    const parsed = fleetDecisionSchema.parse({
      ...base,
      why: 'Token at /Users/skora/.config/gh expired',
      defaultOutcome: 'Lane waits',
      requester: 'release-bot-signoff',
    });
    expect(parsed.kind).toBe('ask');
    expect(parsed.why).toBe('Token at expired');
  });

  it('accepts release status and resolved history on the snapshot', () => {
    const parsed = fleetStateSchema.safeParse(
      sampleFleetState({
        resolved: [
          {
            id: 'retire-rewise-cron',
            title: 'Retire the Rewise cron?',
            answeredVia: 'whatsapp',
            outcome: 'Retire it',
            resolvedAt: '2026-11-20T02:50:00.000Z',
          },
        ],
        release: {
          main: { state: 'frozen', reason: 'Release train', queued: 3 },
          production: { state: 'healthy', sha: '213ede7' },
          migrations: { pending: 1, state: 'gated' },
          incidents: [],
        },
      })
    );
    expect(parsed.success).toBe(true);
  });
});

describe('publisher parseLogin mirror', () => {
  const now = new Date('2026-11-20T03:00:00.000Z');

  it('produces payloads the Web schema accepts', () => {
    const login = parseLogin(githubDevice, now);
    expect(login).not.toBeNull();
    expect(fleetLoginSchema.safeParse(login).success).toBe(true);
  });

  it('drops the link and code once expired', () => {
    const login = parseLogin(
      { ...githubDevice, expiresAt: '2026-11-20T02:00:00.000Z' },
      now
    );
    expect(login).toEqual({
      service: 'github',
      flow: 'device',
      state: 'expired',
      expiresAt: '2026-11-20T02:00:00.000Z',
      machineId: 'devbox',
    });
    expect(fleetLoginSchema.safeParse(login).success).toBe(true);
  });

  it('rejects what the Web schema rejects', () => {
    expect(
      parseLogin({ ...githubDevice, url: 'https://evil.example/x' }, now)
    ).toBeNull();
    expect(parseLogin({ ...githubDevice, userCode: 'x' }, now)).toBeNull();
    expect(parseLogin({ ...githubDevice, service: 'nope' }, now)).toBeNull();
  });
});
