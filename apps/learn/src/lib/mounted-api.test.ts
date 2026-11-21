import { afterEach, describe, expect, it, vi } from 'vitest';
import { appApiPath, mountedFetch } from './mounted-api';

const baseGlobal = globalThis as { __tuturuuuAppBase?: string };

afterEach(() => {
  delete baseGlobal.__tuturuuuAppBase;
  vi.unstubAllGlobals();
});

describe('learn mounted API paths', () => {
  it('prefixes vocabulary routes under /learn and leaves Web chat routes at the root', () => {
    baseGlobal.__tuturuuuAppBase = '/learn';
    expect(appApiPath('/api/v1/vocabulary/pronunciation')).toBe(
      '/learn/api/v1/vocabulary/pronunciation'
    );
    expect(appApiPath('/api/v1/vocabulary/speech')).toBe(
      '/learn/api/v1/vocabulary/speech'
    );
    expect(appApiPath('/api/ai/chat')).toBe('/api/ai/chat');
    expect(appApiPath('/api/ai/chat/new')).toBe('/api/ai/chat/new');
  });

  it('honors the /lms/learn alias and an empty base', () => {
    baseGlobal.__tuturuuuAppBase = '/lms/learn';
    expect(appApiPath('/api/v1/vocabulary/speech')).toBe(
      '/lms/learn/api/v1/vocabulary/speech'
    );
    baseGlobal.__tuturuuuAppBase = '';
    expect(appApiPath('/api/v1/vocabulary/speech')).toBe(
      '/api/v1/vocabulary/speech'
    );
  });

  it('mountedFetch requests the resolved URL', async () => {
    baseGlobal.__tuturuuuAppBase = '/learn';
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await mountedFetch('/api/v1/vocabulary/speech', { method: 'POST' });
    expect(fetchMock).toHaveBeenCalledWith('/learn/api/v1/vocabulary/speech', {
      method: 'POST',
    });
  });
});
