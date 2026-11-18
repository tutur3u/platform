import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedJson } from './wave1-native-publish.mjs';

const refusal = (status) => async () => ({ ok: false, status });
const ACCOUNT = 'e8912e2867beecc673d171907bf09649';
const DATABASE = 'db0d11f0-326f-4222-8816-48ec4f906dba';
const ZONE = '618b9966111b23a37113d30865f1fbb0';
const WORKER = 'tuturuuu-mail-wave1-staging';
const API = 'https://api.cloudflare.com/client/v4';

async function refusedMessage(url, status = 403, body) {
  const error = await boundedJson(
    url,
    'token-value-never-logged',
    refusal(status),
    body
  ).catch((failure) => failure);
  assert.ok(error instanceof Error);
  return error.message;
}

test('a refused control-plane read names the method, host and redacted path', async () => {
  assert.equal(
    await refusedMessage(
      `${API}/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`,
      403,
      { sql: 'SELECT 1', params: [] }
    ),
    'Required control-plane observation failed (403): POST api.cloudflare.com/client/v4/accounts/<account>/d1/database/<id>/query'
  );
  assert.equal(
    await refusedMessage(
      `${API}/accounts/${ACCOUNT}/workers/scripts/${WORKER}/deployments`
    ),
    'Required control-plane observation failed (403): GET api.cloudflare.com/client/v4/accounts/<account>/workers/scripts/<id>/deployments'
  );
  assert.equal(
    await refusedMessage(
      `${API}/accounts/${ACCOUNT}/workers/scripts/${WORKER}/secrets`
    ),
    'Required control-plane observation failed (403): GET api.cloudflare.com/client/v4/accounts/<account>/workers/scripts/<id>/secrets'
  );
  assert.equal(
    await refusedMessage(`${API}/zones/${ZONE}/workers/routes`, 401),
    'Required control-plane observation failed (401): GET api.cloudflare.com/client/v4/zones/<id>/workers/routes'
  );
});

test('a refused read never prints an account, zone, database or script identifier', async () => {
  for (const url of [
    `${API}/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`,
    `${API}/accounts/${ACCOUNT}/workers/scripts/${WORKER}/subdomain`,
    `${API}/zones/${ZONE}/dns_records?per_page=100&name.exact=host.example`,
    `${API}/accounts/${ACCOUNT}/access/apps/${DATABASE}/policies`,
  ]) {
    const message = await refusedMessage(url);
    for (const hidden of [ACCOUNT, DATABASE, ZONE, WORKER, 'host.example'])
      assert.ok(!message.includes(hidden), `leaked ${hidden} in ${message}`);
  }
});

test('opaque identifiers on other hosts are redacted and readable segments stay', async () => {
  assert.equal(
    await refusedMessage(
      `https://api.github.com/repos/o/r/actions/artifacts/${ACCOUNT}/zip`,
      404
    ),
    'Required control-plane observation failed (404): GET api.github.com/repos/o/r/actions/artifacts/<id>/zip'
  );
});

test('a refused read exposes no query string, body or credential', async () => {
  const token = 'token-value-never-logged';
  const message = await refusedMessage(
    'https://api.github.com/repos/o/r/actions/runs?secret=query-value',
    401,
    { sql: 'body-value' }
  );
  for (const hidden of [token, 'query-value', 'body-value', 'secret='])
    assert.ok(!message.includes(hidden), `leaked ${hidden}`);
});

test('an unparseable URL still refuses without echoing the input', async () => {
  const error = await boundedJson(
    'not a url with a-secret',
    undefined,
    refusal(500)
  ).catch((failure) => failure);
  assert.equal(
    error.message,
    'Required control-plane observation failed (500): GET (unparseable URL)'
  );
});
