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
        search: '',
      })
    ).toBe('https://pay.tuturuuu.localhost/?source=apps');
  });

  it('preserves explicit launch source when one is already present', () => {
    const app = getGatewayApp('pay');

    expect(app).toBeTruthy();
    expect(
      buildGatewayRedirectUrl({
        app: app!,
        search: '?source=sidebar-apps',
      })
    ).toBe('https://pay.tuturuuu.localhost/?source=sidebar-apps');
  });

  it('sends the Documents app to its /docs path on the shared origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = getGatewayApp('documents');
    if (!app) throw new Error('Expected the registered Documents app');

    expect(buildGatewayRedirectUrl({ app, search: '' })).toBe(
      'https://tuturuuu.com/docs?source=apps'
    );
    expect(
      buildGatewayRedirectUrl({ app, path: ['a b'], search: '?x=1' })
    ).toBe('https://tuturuuu.com/docs/a%20b?x=1&source=apps');
  });

  it('keeps production launches on the registered production origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = getGatewayApp('pay');
    if (!app) throw new Error('Expected the registered Pay app');

    expect(
      buildGatewayRedirectUrl({
        app,
        search: '?url=https%3A%2F%2Fevil.test&source=sidebar-apps',
      })
    ).toBe(
      'https://pay.tuturuuu.com/?url=https%3A%2F%2Fevil.test&source=sidebar-apps'
    );
  });
});
