import { describe, expect, it } from 'vitest';
import { resolveAppBase } from './mounts';

const meet = {
  app: 'meet',
  rootHosts: ['meet.tuturuuu.com', 'localhost:7807'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/meet',
};
const at = (url: string) => resolveAppBase(new URL(url), meet);

describe('per-request base resolution', () => {
  it('serves the subdomain and local hosts at their root', () => {
    expect(at('https://meet.tuturuuu.com/r/x')).toEqual({
      mode: 'root',
      basePath: '',
    });
    expect(at('https://MEET.tuturuuu.com/')).toEqual({
      mode: 'root',
      basePath: '',
    });
    expect(at('http://localhost:7807/meet/x')).toEqual({
      mode: 'root',
      basePath: '',
    });
  });

  it('serves the apex only under its mount', () => {
    expect(at('https://tuturuuu.com/meet')).toEqual({
      mode: 'mounted',
      basePath: '/meet',
    });
    expect(at('https://tuturuuu.com/meet/r/x')?.basePath).toBe('/meet');
    expect(at('https://tuturuuu.com/meetings')).toBeNull();
    expect(at('https://tuturuuu.com/')).toBeNull();
  });

  it('treats unknown hosts as root unless rejected', () => {
    expect(at('https://preview.workers.dev/x')?.mode).toBe('root');
    expect(
      resolveAppBase(new URL('https://preview.workers.dev/x'), {
        ...meet,
        unknownHost: 'reject',
      })
    ).toBeNull();
    expect(() =>
      resolveAppBase(new URL('https://tuturuuu.com/x'), {
        app: 'meet',
        rootHosts: [],
        mountHosts: ['tuturuuu.com'],
      })
    ).toThrow('needs a basePath');
  });
});
