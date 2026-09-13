import { describe, expect, it } from 'vitest';
import {
  assertCatalogWebhookProbe,
  assertProductionCatalogWebhook,
  PRODUCTION_CATALOG_WEBHOOK_URL,
} from './catalog-webhook';

const endpoint = {
  organizationId: 'org',
  url: PRODUCTION_CATALOG_WEBHOOK_URL,
  enabled: true,
  format: 'raw',
  events: ['product.updated'],
  secret: 'test-signing-secret',
};
describe('catalog delivery preflight', () => {
  it('accepts the configured delivery path', () =>
    expect(() =>
      assertProductionCatalogWebhook([endpoint], 'org', endpoint.secret)
    ).not.toThrow());
  it.each(
    [
      [],
      [endpoint, endpoint],
      [{ ...endpoint, enabled: false }],
      [{ ...endpoint, format: 'slack' }],
      [{ ...endpoint, format: 'discord' }],
      [{ ...endpoint, events: [] }],
      [{ ...endpoint, organizationId: 'other' }],
      [{ ...endpoint, url: 'https://other.example/webhook' }],
      [{ ...endpoint, secret: 'different' }],
    ].map((endpoints) => ({ endpoints }))
  )('rejects disabled, ambiguous or mismatched endpoints', ({ endpoints }) => {
    expect(() =>
      assertProductionCatalogWebhook(endpoints, 'org', endpoint.secret)
    ).toThrow('no prices changed');
  });
  it('requires the trusted deployment secret', () =>
    expect(() =>
      assertProductionCatalogWebhook([endpoint], 'org', undefined)
    ).toThrow('no prices changed'));
  it('accepts the signature validator rejection', () =>
    expect(() =>
      assertCatalogWebhookProbe(403, { received: false })
    ).not.toThrow());
  it.each([
    [401, { error: 'Unauthorized' }],
    [403, null],
    [403, 'Authentication Required'],
    [200, { received: true }],
    [503, {}],
  ])('rejects an unavailable signature handler', (status, body) => {
    expect(() => assertCatalogWebhookProbe(status as number, body)).toThrow(
      'no prices changed'
    );
  });
});
