import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxyAppUrl } from './proxy-app-url';

const based = (url: string) =>
  new NextRequest(url, { nextConfig: { basePath: '/tasks' } });

describe('proxyAppUrl', () => {
  it('is the identity at the origin root', () => {
    const request = new NextRequest('https://tasks.tuturuuu.com/en/a?x=1');

    expect(proxyAppUrl(request, '/vi/personal/tasks?y=2').href).toBe(
      'https://tasks.tuturuuu.com/vi/personal/tasks?y=2'
    );
  });

  it('prefixes the basePath and replaces the query', () => {
    const request = based('https://tuturuuu.com/tasks/en/a?x=1');

    expect(proxyAppUrl(request, '/vi/personal/tasks').href).toBe(
      'https://tuturuuu.com/tasks/vi/personal/tasks'
    );
    expect(proxyAppUrl(request, '/?y=2').href).toBe(
      'https://tuturuuu.com/tasks/?y=2'
    );
  });

  it('does not prefix a path that already carries the base', () => {
    const request = based('https://tuturuuu.com/tasks/en/a');

    expect(proxyAppUrl(request, '/tasks/en/personal/tasks?y=2').href).toBe(
      'https://tuturuuu.com/tasks/en/personal/tasks?y=2'
    );
    expect(proxyAppUrl(request, '/tasks').href).toBe(
      'https://tuturuuu.com/tasks/'
    );
    expect(proxyAppUrl(request, '/tasksx/a').href).toBe(
      'https://tuturuuu.com/tasks/tasksx/a'
    );
  });

  it('never leaves the request origin', () => {
    const request = based('https://tuturuuu.com/tasks/en/a');

    expect(proxyAppUrl(request, '//evil.example/x?y=1').origin).toBe(
      'https://tuturuuu.com'
    );
  });
});
