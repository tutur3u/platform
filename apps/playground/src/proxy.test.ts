import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

describe('guest playground proxy', () => {
  it('disables middleware matching for the public Worker boundary', () => {
    expect(config.matcher).toEqual([]);
  });

  it('passes through without redirecting or setting cookies', async () => {
    const response = await proxy();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
