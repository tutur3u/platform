import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALERT_KEY,
  alertState,
  syncAlert,
} from './upskii-production-e2e-alert.mjs';
import { attemptUrl, boundedBody, MAX_ALERT_BODY } from './ttr-task-alert.mjs';

const RUN = 'https://github.com/tutur3u/platform/actions/runs/1';

describe('upskii production e2e alert', () => {
  it('maps job results to alert states', () => {
    assert.equal(alertState('failure'), 'failing');
    assert.equal(alertState('cancelled'), 'failing');
    assert.equal(alertState('success'), 'recovered');
    assert.equal(alertState('skipped'), null);
  });

  it('reports a recovery to the internal alert sink, never GitHub', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ action: 'close' }), { status: 200 });
    };
    const action = await syncAlert(
      {
        TTR_CI_ALERT_TOKEN: 'test-token',
        E2E_RESULT: 'success',
        E2E_TRIGGER: 'workflow_dispatch',
        E2E_RUN_URL: RUN,
      },
      fetchImpl
    );
    assert.equal(action, 'close');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://tasks.tuturuuu.com/api/v1/ci/alerts');
    assert.equal(calls[0].init.headers['x-ci-alert-token'], 'test-token');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.key, ALERT_KEY);
    assert.equal(body.state, 'recovered');
    assert.equal(body.runUrl, RUN);
  });

  it('reports each run attempt and bounds the body', () => {
    assert.equal(attemptUrl(RUN, '2'), `${RUN}/attempts/2`);
    assert.equal(attemptUrl(`${RUN}/attempts/1`, 3), `${RUN}/attempts/3`);
    assert.equal(attemptUrl(RUN, ''), RUN);
    assert.equal(boundedBody('ok'), 'ok');
    assert.ok(boundedBody('x'.repeat(9000)).length < 8000);
    const emoji = boundedBody(`${'x'.repeat(MAX_ALERT_BODY - 1)}\u{1F600}`);
    assert.doesNotMatch(emoji, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    assert.ok(MAX_ALERT_BODY < 8000);
  });

  it('files nothing without the alert token', async () => {
    const action = await syncAlert(
      { E2E_RESULT: 'failure', E2E_TRIGGER: 'schedule', E2E_RUN_URL: RUN },
      () => {
        throw new Error('must not call');
      }
    );
    assert.equal(action, 'unconfigured');
  });
});
