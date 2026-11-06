import { expect, test } from 'bun:test';
import { comparePathPatterns, matchPath } from './registry';

test('specific route ownership takes priority over dynamic routes', () => {
  const routes = ['/api/{wsId}/users', '/api/v1/{resource}', '/api/v1/users'];
  expect(routes.sort(comparePathPatterns)).toEqual([
    '/api/v1/users',
    '/api/v1/{resource}',
    '/api/{wsId}/users',
  ]);
  expect(
    matchPath(
      '/api/v1/workspaces/{wsId}/documents/{documentId}',
      '/api/v1/workspaces/A/documents/doc-one'
    )
  ).toEqual({ wsId: 'A', documentId: 'doc-one' });
});

test('retained required and optional catch-all patterns preserve tail segments', () => {
  expect(
    matchPath('/api/trpc/{...procedure}', '/api/trpc/health/check')
  ).toEqual({ procedure: 'health/check' });
  expect(matchPath('/api/trpc/{...procedure}', '/api/trpc')).toBeNull();
  expect(matchPath('/api/share/{...path?}', '/api/share')).toEqual({
    path: '',
  });
});
