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

test('Calendar cron routes retain their Cron Control cadence and enablement', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const { normalizeCronConfig } = require('./web-crons.js');
  const read = (file) => readFileSync(join(__dirname, '..', file), 'utf8');
  const jobs = read('apps/cron-control/src/jobs.ts');
  const worker = read('apps/cron-control/cloudflare.config.ts');
  const enabled = /CRON_CONTROL_ENABLED_JOBS: bindings.text\(\s*'([^']+)'/
    .exec(worker)?.[1]
    .split(',');
  assert.ok(enabled);
  const web = normalizeCronConfig(
    JSON.parse(read('apps/web/cron.config.json'))
  );
  const monitored = JSON.parse(read('apps/admin/cron.config.json')).jobs;
  for (const [name, schedule] of [
    ['provider-sync', '*/15 * * * *'],
    ['smart-schedule', '0 */6 * * *'],
  ]) {
    const path = `/api/cron/calendar/${name}`;
    assert.equal(jobs.split(`'${path}'`).length - 1, 1);
    assert.ok(
      jobs.includes(
        `job(
    'calendar-${name}',
    '${schedule}',
    'infrastructure',
    '${path}',`
      )
    );
    assert.ok(worker.includes(`'${schedule}'`));
    assert.equal(
      enabled.includes(`calendar-${name}`),
      name === 'provider-sync'
    );
    assert.equal(web.jobs.find((job) => job.path === path)?.enabled, true);
    assert.equal(
      monitored.find((job) => job.path === path)?.schedule,
      schedule
    );
  }
});
