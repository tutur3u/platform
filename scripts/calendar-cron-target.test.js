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

test('hosted Calendar jobs have exactly one owner and keep Docker execution', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const {
    normalizeCronConfig,
    getVercelCronsFromConfig,
  } = require('./web-crons.js');
  const read = (file) =>
    JSON.parse(readFileSync(join(__dirname, '..', file), 'utf8'));
  const infra = read('apps/infrastructure/vercel.json').crons;
  const calendar = read('apps/calendar/vercel.json').crons ?? [];
  const web = normalizeCronConfig(read('apps/web/cron.config.json'));
  const generatedWeb = getVercelCronsFromConfig(web);
  const monitored = read('apps/infrastructure/cron.config.json').jobs;
  for (const [name, schedule] of [
    ['provider-sync', '*/15 * * * *'],
    ['smart-schedule', '0 */6 * * *'],
  ]) {
    const path = `/api/cron/calendar/${name}`;
    assert.deepEqual(
      infra.filter((job) => job.path === path),
      [{ path, schedule }]
    );
    assert.equal(
      calendar.some((job) => job.path === path),
      false
    );
    assert.equal(
      generatedWeb.some((job) => job.path === path),
      false
    );
    assert.equal(web.jobs.find((job) => job.path === path)?.enabled, true);
    assert.equal(
      monitored.find((job) => job.path === path)?.schedule,
      schedule
    );
  }
});
