import { describe, expect, it } from 'vitest';
import { buildGatewayRedirectUrl, getGatewayApp } from './apps-registry';

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
});
