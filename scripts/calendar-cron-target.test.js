const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveCronRequest } = require('./calendar-cron-target.js');

const env = {
  CRON_SECRET: 'test-cron',
  CALENDAR_CRON_GATEWAY_SECRET: 'a'.repeat(43),
  INTERNAL_WEB_API_ORIGIN: 'http://web-proxy:7803',
};

test('both Calendar jobs reach the owner with private server credentials', () => {
  for (const job of ['provider-sync', 'smart-schedule']) {
    const result = resolveCronRequest(`/api/cron/calendar/${job}`, env);
    assert.equal(result.url.origin, 'https://calendar.tuturuuu.com');
    assert.equal(result.headers.Authorization, 'Bearer test-cron');
    assert.equal(result.headers['x-tuturuuu-calendar-gateway'], 'a'.repeat(43));
  }
});

test('missing or malformed hosting credentials fail closed', () => {
  for (const secret of [undefined, '', 'bad\nvalue']) {
    assert.throws(
      () =>
        resolveCronRequest('/api/cron/calendar/provider-sync', {
          ...env,
          CALENDAR_CRON_GATEWAY_SECRET: secret,
        }),
      /not configured/
    );
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
