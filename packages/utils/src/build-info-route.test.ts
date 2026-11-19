import { describe, expect, it } from 'vitest';
import {
  createBuildInfoHandler,
  createPublicBuildInfoHandler,
  isPublicBuildInfoRequest,
} from './build-info-route';

describe('createBuildInfoHandler', () => {
  it('reports the app name and the build the bundle was made from', async () => {
    const response = createBuildInfoHandler('tasks')();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appName).toBe('tasks');
    expect(typeof body.commitHash).toBe('string');
    expect(body.commitHash.length).toBeGreaterThan(0);
    expect(typeof body.version).toBe('string');
    // Vercel and every other non-worker caller share this handler. The
    // Cloudflare platform stamp stays on the worker response.
    expect(body.platform).toBeUndefined();
    expect(body.commit).toBeUndefined();
  });

  it('is never cached', () => {
    // A cached build stamp would defeat the point: it could report a commit
    // the edge served earlier rather than the one running now.
    const response = createBuildInfoHandler('web')();

    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

describe('createPublicBuildInfoHandler', () => {
  it('exposes only the commit and build time', async () => {
    const response = createPublicBuildInfoHandler('mail')();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'appName',
      'builtAt',
      'commitHash',
      'shortCommitHash',
    ]);
    expect(body.appName).toBe('mail');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

describe('isPublicBuildInfoRequest', () => {
  const request = (method: string, pathname: string) => ({
    method,
    nextUrl: { pathname },
  });

  it('admits only GET and HEAD on the exact build-info path', () => {
    expect(isPublicBuildInfoRequest(request('GET', '/api/build-info'))).toBe(
      true
    );
    expect(isPublicBuildInfoRequest(request('HEAD', '/api/build-info'))).toBe(
      true
    );
    expect(isPublicBuildInfoRequest(request('POST', '/api/build-info'))).toBe(
      false
    );
    expect(
      isPublicBuildInfoRequest(request('GET', '/api/build-info/extra'))
    ).toBe(false);
    expect(isPublicBuildInfoRequest(request('GET', '/api/v1/build-info'))).toBe(
      false
    );
  });
});
