import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  bundleFailureSummary,
  finalHeaderBlock,
  main,
} from './bundle-response.mjs';

function fixture(headers, body) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-response-'));
  const headersPath = join(dir, 'bundle.json.headers');
  const bodyPath = join(dir, 'bundle.json');
  writeFileSync(headersPath, headers);
  writeFileSync(bodyPath, body);
  return { dir, headersPath, bodyPath };
}

function captureLog(run) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    return { result: run(), lines };
  } finally {
    console.log = original;
  }
}

test('a successful bundle is kept, never printed, and its headers are removed', () => {
  const { dir, headersPath, bodyPath } = fixture(
    'HTTP/2 200\r\ncontent-type: application/json\r\n\r\n',
    '{"secret":"signing-material"}'
  );
  try {
    const { result, lines } = captureLog(() =>
      main(['200', headersPath, bodyPath])
    );
    assert.equal(result, 0);
    assert.deepEqual(lines, []);
    assert.ok(existsSync(bodyPath));
    assert.equal(existsSync(headersPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed bundle reports bounded fields and deletes both files', () => {
  const { dir, headersPath, bodyPath } = fixture(
    [
      'HTTP/2 301\r\nlocation: https://example.invalid\r\n\r\n',
      'HTTP/2 503\r\nserver: cloudflare\r\ncf-ray: 8f00aa11bb22cc33-SIN\r\n',
      'x-tuturuuu-guard-reason: app-session-refresh-unavailable\r\n',
      'x-tuturuuu-guard-request-id: 6f1d2c3b-0a9e-4f7d-8c21-5b4a3e2d1c0f\r\n\r\n',
    ].join(''),
    '{"code":"bundle_store_unavailable","message":"Mobile deployment bundle unavailable","detail":"Bearer leaked-value"}'
  );
  try {
    const { result, lines } = captureLog(() =>
      main(['503', headersPath, bodyPath])
    );
    assert.equal(result, 1);
    assert.equal(lines.length, 1);
    assert.equal(
      lines[0],
      '::error title=Mobile deployment bundle unavailable::HTTP 503; guard reason app-session-refresh-unavailable; code bundle_store_unavailable; message "Mobile deployment bundle unavailable"; server cloudflare; guard request 6f1d2c3b-0a9e-4f7d-8c21-5b4a3e2d1c0f; cf-ray 8f00aa11bb22cc33-SIN'
    );
    assert.doesNotMatch(lines[0], /leaked-value|example\.invalid/);
    assert.equal(existsSync(bodyPath), false);
    assert.equal(existsSync(headersPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unsafe or non-JSON failure bodies contribute nothing', () => {
  assert.equal(
    bundleFailureSummary(
      '502',
      finalHeaderBlock(
        'HTTP/1.1 502 Bad Gateway\nx-tuturuuu-guard-reason: a b\n\n'
      ),
      '<html>token=abc</html>'
    ),
    'HTTP 502'
  );
  assert.equal(
    bundleFailureSummary(
      '401',
      new Map(),
      JSON.stringify({ code: 'x'.repeat(200), message: 'contains\nnewline' })
    ),
    'HTTP 401'
  );
});

test('missing arguments fail with a usage error', () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(main(['503']), 64);
  } finally {
    console.error = original;
  }
});
