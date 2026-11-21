import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchAlerts,
  intakeRecords,
  ORIGIN_ENV,
  TOKEN_ENV,
} from './perf-observability-alerts.mjs';

const record = {
  app: 'meet',
  id: 'slo-slo-workers-availability-page-tuturuuu-meet-20261121t0300',
  metric: 'error_rate',
  source: 'observability-slo',
  startTime: '2026-11-21T03:00:00Z',
  worker: 'tuturuuu-meet',
};

test('keeps only well-formed observability records', () => {
  assert.deepEqual(
    intakeRecords({
      regressions: [
        record,
        { ...record, source: 'other' },
        { ...record, id: '../x' },
        { ...record, startTime: 'never' },
      ],
    }),
    [record]
  );
  assert.deepEqual(intakeRecords(null), []);
});

test('sends the bearer token only to the configured https origin', async () => {
  let seen;
  const document = await fetchAlerts(
    { [ORIGIN_ENV]: 'https://admin.example', [TOKEN_ENV]: 'secret-token' },
    async (url, init) => {
      seen = {
        url: String(url),
        auth: init.headers.Authorization,
        redirect: init.redirect,
      };
      return new Response(JSON.stringify({ regressions: [record] }));
    }
  );
  assert.equal(
    seen.url,
    'https://admin.example/api/v1/infrastructure/observability/alerts'
  );
  assert.equal(seen.auth, 'Bearer secret-token');
  assert.equal(seen.redirect, 'error');
  assert.equal(document.regressions.length, 1);
  await assert.rejects(
    fetchAlerts(
      { [ORIGIN_ENV]: 'http://admin.example', [TOKEN_ENV]: 't' },
      fetch
    ),
    /https/
  );
  await assert.rejects(fetchAlerts({}, fetch), new RegExp(ORIGIN_ENV));
});
