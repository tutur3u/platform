import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALERT_LABEL,
  alertAction,
  syncAlert,
} from './upskii-production-e2e-alert.mjs';

describe('upskii production e2e alert', () => {
  it('opens, comments and closes the single alert issue', () => {
    assert.equal(alertAction('failure', null), 'open');
    assert.equal(alertAction('cancelled', null), 'open');
    assert.equal(alertAction('failure', { number: 1 }), 'comment');
    assert.equal(alertAction('success', { number: 1 }), 'close');
    assert.equal(alertAction('success', null), 'none');
    assert.equal(alertAction('skipped', null), 'none');
  });

  it('closes an open issue after a green run', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      const body = url.includes(`labels=${ALERT_LABEL}`) ? [{ number: 7 }] : {};
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const action = await syncAlert(
      {
        GITHUB_REPOSITORY: 'tutur3u/platform',
        E2E_RESULT: 'success',
        E2E_TRIGGER: 'workflow_dispatch',
        E2E_RUN_URL: 'https://github.com/tutur3u/platform/actions/runs/1',
      },
      fetchImpl
    );
    assert.equal(action, 'close');
    assert.deepEqual(calls, [
      'GET /repos/tutur3u/platform/issues',
      'POST /repos/tutur3u/platform/issues/7/comments',
      'PATCH /repos/tutur3u/platform/issues/7',
    ]);
  });
});
