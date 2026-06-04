import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildServerArgs,
  resolveMaxHttpHeaderSize,
} = require('./prod-entrypoint.js');

test('prod entrypoint starts Next with expanded HTTP header headroom', () => {
  expect(buildServerArgs({})).toEqual([
    '--max-http-header-size=65536',
    '--require',
    './apps/web/docker/request-tracker.js',
    'apps/web/server.js',
  ]);
});

test('prod entrypoint accepts an explicit numeric header-size override', () => {
  expect(
    buildServerArgs({ DOCKER_WEB_NODE_MAX_HTTP_HEADER_SIZE: '98304' })[0]
  ).toBe('--max-http-header-size=98304');
});

test('prod entrypoint ignores invalid header-size overrides', () => {
  expect(
    resolveMaxHttpHeaderSize({ DOCKER_WEB_NODE_MAX_HTTP_HEADER_SIZE: 'bad' })
  ).toBe('65536');
});
