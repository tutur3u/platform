import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('retired crawler execution route', () => {
  it('rejects every crawl request without starting external work', async () => {
    const response = POST();

    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      message: 'Crawler execution has been retired',
    });
  });
});
