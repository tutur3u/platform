// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGatewayRedirectUrl, getGatewayApp } from './apps-registry';

beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
afterEach(() => vi.unstubAllEnvs());

describe('buildGatewayRedirectUrl', () => {
  it('marks Apps gateway launches with source=apps by default', () => {
    const app = getGatewayApp('pay');

    expect(app).toBeTruthy();
    expect(
      buildGatewayRedirectUrl({
        app: app!,
        searchParams: {},
      })
    ).toBe('https://pay.tuturuuu.localhost/?source=apps');
  });

  it('preserves explicit launch source when one is already present', () => {
    const app = getGatewayApp('pay');

    expect(app).toBeTruthy();
    expect(
      buildGatewayRedirectUrl({
        app: app!,
        searchParams: { source: 'sidebar-apps' },
      })
    ).toBe('https://pay.tuturuuu.localhost/?source=sidebar-apps');
  });

  it('keeps production launches on the registered production origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = getGatewayApp('pay');
    if (!app) throw new Error('Expected the registered Pay app');

    expect(
      buildGatewayRedirectUrl({
        app,
        searchParams: { url: 'https://evil.test', source: 'sidebar-apps' },
      })
    ).toBe(
      'https://pay.tuturuuu.com/?url=https%3A%2F%2Fevil.test&source=sidebar-apps'
    );
  });
});
