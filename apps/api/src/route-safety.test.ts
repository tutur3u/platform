import { expect, test } from 'bun:test';
import {
  assertShadowReplayAllowed,
  retainedReplayPolicy,
  validateRetainedCoverage,
} from './route-safety';

const endpoint = (path: string, aliases: string[] = []) => ({
  path,
  aliases: aliases.map((path) => ({
    path,
    errorEncoding: 'canonical' as const,
  })),
});

test('side-effectful GET and cron routes are never shadow/replay candidates', () => {
  for (const path of [
    '/api/v1/exchange-rates',
    '/api/cron/finance/exchange-rates',
    '/api/cron/send-emails',
  ]) {
    const route = { path, ...retainedReplayPolicy(path) };
    expect(route).toMatchObject({ sideEffects: 'writes', shadow: 'never' });
    expect(() => assertShadowReplayAllowed(route, 'GET')).toThrow();
  }
});

test('unknown and incomplete metadata denies shadow/replay by default', () => {
  for (const route of [
    { path: '/api/users' },
    { path: '/api/users', sideEffects: 'read-only' },
    { path: '/api/users', shadow: 'safe' },
    { path: '/api/users', sideEffects: 'writes', shadow: 'safe' },
  ]) {
    expect(() => assertShadowReplayAllowed(route, 'GET')).toThrow();
  }
  expect(retainedReplayPolicy('/api/v1/users')).toEqual({
    sideEffects: 'unknown',
    shadow: 'never',
  });
  const safe = { path: '/api/health', ...retainedReplayPolicy('/api/health') };
  expect(() => assertShadowReplayAllowed(safe, 'GET')).not.toThrow();
  expect(() => assertShadowReplayAllowed(safe, 'POST')).toThrow();
});

test('generic workspace registration cannot capture unregistered static retained routes', () => {
  const retained = [{ path: '/api/v1/workspaces/limits' }];
  expect(() =>
    validateRetainedCoverage([endpoint('/api/v1/workspaces/{wsId}')], retained)
  ).toThrow('would capture');
  expect(() =>
    validateRetainedCoverage(
      [
        endpoint('/api/v1/workspaces/{wsId}'),
        endpoint('/api/v1/workspaces/limits'),
      ],
      retained
    )
  ).not.toThrow();
});

test('aliases, intersecting dynamic paths and catch-all tails participate in the guard', () => {
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/native', ['/api/v1/workspaces/{wsId}'])],
      [{ path: '/api/v1/workspaces/limits' }]
    )
  ).toThrow();
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/fixed')],
      [{ path: '/api/static/{id}' }]
    )
  ).toThrow();
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/fixed')],
      [{ path: '/api/static/{...tail}' }]
    )
  ).toThrow();
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/fixed')],
      [{ path: '/api/static/{...tail?}' }]
    )
  ).toThrow();
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/fixed')],
      [{ path: '/api/static/other' }]
    )
  ).not.toThrow();
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/fixed')],
      [{ path: '/api/static/fixed/extra' }]
    )
  ).not.toThrow();
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/fixed')],
      [{ path: '/api/{workspaceId}/fixed' }]
    )
  ).not.toThrow();
});

test('a single-segment registration cannot stand in for a retained catch-all', () => {
  expect(() =>
    validateRetainedCoverage(
      [endpoint('/api/{id}/a/b'), endpoint('/api/static/{id}')],
      [{ path: '/api/static/{...tail}' }]
    )
  ).toThrow();
});
