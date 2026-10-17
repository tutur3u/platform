import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  caseResponseDiagnostic,
  projectCaseDiagnostic,
} from './employee-web-session-case-diagnostic.mjs';

test('inactive boundary diagnostics distinguish setup, response and assertion without private fields', () => {
  for (const check of ['ban-update', 'request']) {
    const value = {
      case: 'inactive-actor',
      check,
      status: null,
      code: null,
      noStore: null,
    };
    assert.deepEqual(
      projectCaseDiagnostic({
        ...value,
        secret: 'private-token',
        body: { email: 'private@example.test' },
      }),
      value
    );
  }
  assert.deepEqual(
    projectCaseDiagnostic({
      case: 'inactive-actor',
      check: 'json',
      status: 503,
      code: null,
      noStore: null,
    }),
    {
      case: 'inactive-actor',
      check: 'json',
      status: 503,
      code: null,
      noStore: null,
    }
  );
  assert.deepEqual(caseResponseDiagnostic(401, 'unauthorized', true), {
    case: 'inactive-actor',
    check: 'no-store',
    status: 401,
    code: 'unauthorized',
    noStore: true,
  });
  assert.equal(
    caseResponseDiagnostic(503, 'private-token', true).code,
    'other'
  );
  assert.equal(caseResponseDiagnostic(200, undefined, false).code, 'absent');
});

test('case diagnostics reject malformed values and impossible progress shapes', () => {
  const value = {
    case: 'inactive-actor',
    check: 'status-code',
    status: 403,
    code: 'forbidden',
    noStore: true,
  };
  for (const candidate of [
    null,
    [],
    {},
    { ...value, case: 'private-identity' },
    { ...value, check: 'private-stack' },
    { ...value, status: '403' },
    { ...value, status: 99 },
    { ...value, status: 600 },
    { ...value, status: null },
    { ...value, code: 'private-token' },
    { ...value, noStore: false },
    { ...value, noStore: 'true' },
    { ...value, check: 'ban-update' },
    { ...value, check: 'json' },
  ])
    assert.throws(() => projectCaseDiagnostic(candidate));
  assert.ok(
    Buffer.byteLength(JSON.stringify(projectCaseDiagnostic(value))) < 256
  );
});

test('real disposable loopback statuses retain only fixed metadata', async () => {
  const server = createServer((request, response) => {
    const status =
      request.url === '/401' ? 401 : request.url === '/403' ? 403 : 503;
    response.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    response.end(
      JSON.stringify({
        code:
          status === 401
            ? 'unauthorized'
            : status === 403
              ? 'forbidden'
              : 'private-provider-message',
        private: 'private-token',
      })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const [status, code] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [503, 'other'],
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/${status}`,
        { signal: AbortSignal.timeout(2000) }
      );
      const value = await response.json();
      const diagnostic = caseResponseDiagnostic(
        response.status,
        value.code,
        response.headers.get('cache-control')?.includes('no-store') === true
      );
      assert.deepEqual(diagnostic, {
        case: 'inactive-actor',
        check: 'no-store',
        status,
        code,
        noStore: true,
      });
      assert.ok(!JSON.stringify(diagnostic).includes('private'));
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('self-action metadata keeps only exact fixed codes and rejects foreign progress', () => {
  for (const code of [
    'employee_self_action',
    'invalid_request',
    'UNAUTHENTICATED',
    'forbidden',
    'unauthorized',
  ]) {
    assert.equal(
      caseResponseDiagnostic(409, code, true, 'self-action').code,
      code
    );
    assert.equal(
      caseResponseDiagnostic(409, code, true).code,
      ['forbidden', 'unauthorized'].includes(code) ? code : 'other'
    );
  }
  for (const code of [
    'EMPLOYEE_SELF_ACTION',
    'employee_self_action private-token',
    'private@example.test',
    'absent',
    {},
    'x'.repeat(100_000),
  ])
    assert.equal(
      caseResponseDiagnostic(409, code, true, 'self-action').code,
      'other'
    );
  const value = {
    case: 'self-action',
    check: 'status-code',
    status: 409,
    code: 'employee_self_action',
    noStore: true,
  };
  assert.deepEqual(
    projectCaseDiagnostic({
      ...value,
      body: { token: 'private-token' },
      raw: 'x'.repeat(100_000),
    }),
    value
  );
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 256);
  for (const extra of [
    { check: 'ban-update' },
    { status: '409' },
    { status: 600 },
    { code: 'private-token' },
    { noStore: false },
    { check: 'request' },
    { case: 'private-actor' },
  ])
    assert.throws(() => projectCaseDiagnostic({ ...value, ...extra }));
});

test('self-action real loopback responses expose only fixed status/code/no-store fields', async () => {
  const replies = [
    [409, 'employee_self_action'],
    [400, 'invalid_request'],
    [401, 'UNAUTHENTICATED'],
    [429, undefined],
    [503, 'private-secret'],
  ];
  const server = createServer((request, response) => {
    const [status, code] = replies[Number(request.url.slice(1))];
    response.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    response.end(
      JSON.stringify({
        code,
        token: 'private-secret',
        email: 'private@example.test',
      })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const [index, [status, code]] of replies.entries()) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/${index}`,
        { signal: AbortSignal.timeout(2000) }
      );
      const body = await response.json();
      const diagnostic = caseResponseDiagnostic(
        response.status,
        body.code,
        response.headers.get('cache-control') === 'no-store',
        'self-action'
      );
      assert.deepEqual(diagnostic, {
        case: 'self-action',
        check: 'no-store',
        status,
        code:
          code === undefined
            ? 'absent'
            : code === 'private-secret'
              ? 'other'
              : code,
        noStore: true,
      });
      assert.ok(!JSON.stringify(diagnostic).includes('private'));
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
