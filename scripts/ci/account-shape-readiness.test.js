import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareAccountShapeRoutes } from '../../apps/web/e2e/helpers/account-shape-readiness.ts';

const workspaceId = '00000000-0000-0000-0000-000000000123';
const walletUrl = `https://finance.tuturuuu.localhost:1355/${workspaceId}/wallets`;

function fixture({
  status = 200,
  body,
  financeStatus = 200,
  financeUrl = walletUrl,
  finishedError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    options: {
      workspaceId,
      contactsBaseUrl: 'https://contacts.tuturuuu.localhost:1355',
      financeBaseUrl: 'https://finance.tuturuuu.localhost:1355',
      contactsRequest: {
        async get(url, options) {
          calls.push({ url, options });
          return {
            status: () => status,
            async json() {
              calls.push('complete JSON');
              return body ?? { count: 1, notifications: [] };
            },
          };
        },
      },
      financePage: {
        async goto(url) {
          calls.push({ url });
          return {
            status: () => financeStatus,
            url: () => financeUrl,
            headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
            async finished() {
              calls.push('complete HTML');
              return finishedError;
            },
          };
        },
      },
    },
  };
}

test('prepares workspace-scoped routes sequentially and awaits full bodies without timeout overrides', async () => {
  const { options, calls } = fixture();
  await prepareAccountShapeRoutes(options);
  assert.equal(calls.length, 6);
  const countUrl = new URL(calls[0].url);
  const listUrl = new URL(calls[2].url);
  assert.equal(countUrl.searchParams.get('wsId'), workspaceId);
  assert.equal(listUrl.searchParams.get('wsId'), workspaceId);
  assert.equal(listUrl.searchParams.get('unreadOnly'), 'true');
  assert.deepEqual(calls[0].options, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  assert.equal(calls[1], 'complete JSON');
  assert.equal(calls[3], 'complete JSON');
  assert.deepEqual(calls[4], { url: walletUrl });
  assert.equal(calls[5], 'complete HTML');
});

for (const status of [302, 401, 403, 500]) {
  test(`fails readiness on Contacts ${status} without retrying or continuing`, async () => {
    const { options, calls } = fixture({ status });
    await assert.rejects(
      prepareAccountShapeRoutes(options),
      /readiness failed/
    );
    assert.equal(calls.length, 1);
  });
}

test('rejects malformed successful notification responses', async () => {
  await assert.rejects(
    prepareAccountShapeRoutes(fixture({ body: {} }).options),
    /invalid/
  );
});

test('does not accept a redirected login page as Finance readiness', async () => {
  await assert.rejects(
    prepareAccountShapeRoutes(
      fixture({ financeUrl: 'https://finance.tuturuuu.localhost:1355/login' })
        .options
    ),
    /HTML unavailable/
  );
});

test('propagates incomplete Finance response failure', async () => {
  const error = new Error('connection closed');
  await assert.rejects(
    prepareAccountShapeRoutes(fixture({ finishedError: error }).options),
    error
  );
});

test('fails readiness on an unsuccessful Finance response', async () => {
  await assert.rejects(
    prepareAccountShapeRoutes(fixture({ financeStatus: 403 }).options),
    /returned 403/
  );
});

test('propagates readiness timeouts without retrying', async () => {
  const { options, calls } = fixture();
  options.contactsRequest.get = async () => {
    calls.push('request');
    throw new Error('request timeout');
  };
  await assert.rejects(prepareAccountShapeRoutes(options), /request timeout/);
  assert.deepEqual(calls, ['request']);
});
