const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveCronRequest } = require('./calendar-cron-target.js');

const env = {
  CRON_SECRET: 'test-cron',
  INTERNAL_WEB_API_ORIGIN: 'http://web-proxy:7803',
};

test('both Calendar jobs reach the owner with private server credentials', () => {
  for (const job of ['provider-sync', 'smart-schedule']) {
    const result = resolveCronRequest(`/api/cron/calendar/${job}`, env);
    assert.equal(result.url.origin, 'https://infrastructure.tuturuuu.com');
    assert.equal(result.headers.Authorization, 'Bearer test-cron');
    assert.equal(result.headers['x-tuturuuu-calendar-gateway'], undefined);
  }
});

test('other jobs keep internal routing and never receive Calendar credentials', () => {
  const result = resolveCronRequest('/api/cron/finance/exchange-rates', env);
  assert.equal(result.url.origin, env.INTERNAL_WEB_API_ORIGIN);
  assert.equal(result.headers['x-tuturuuu-calendar-gateway'], undefined);
});

test('job paths cannot redirect or escape the configured origin', () => {
  for (const path of [
    'https://evil.example',
    '//evil.example',
    '/api/cron/../other',
    '/api/cron/%2e%2e/other',
    '/api/cron/a?redirect=evil',
  ]) {
    assert.throws(() => resolveCronRequest(path, env), /Invalid cron route/);
  }
});
