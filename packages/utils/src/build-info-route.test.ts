import { describe, expect, it } from 'vitest';
import { createBuildInfoHandler } from './build-info-route';

describe('createBuildInfoHandler', () => {
  it('reports the app name and the build the bundle was made from', async () => {
    const response = createBuildInfoHandler('tasks')();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appName).toBe('tasks');
    expect(typeof body.commitHash).toBe('string');
    expect(body.commitHash.length).toBeGreaterThan(0);
    expect(typeof body.version).toBe('string');
  });

  it('is never cached', () => {
    // A cached build stamp would defeat the point: it could report a commit
    // the edge served earlier rather than the one running now.
    const response = createBuildInfoHandler('web')();

    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
