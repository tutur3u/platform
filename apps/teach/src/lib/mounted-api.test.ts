import { afterEach, describe, expect, it, vi } from 'vitest';
import { appApiPath, mountedFetch } from './mounted-api';

const baseGlobal = globalThis as { __tuturuuuAppBase?: string };

afterEach(() => {
  delete baseGlobal.__tuturuuuAppBase;
  vi.unstubAllGlobals();
});

describe('teach mounted API paths', () => {
  it('prefixes module vocabulary, suggestions, images, details and AI objects', () => {
    baseGlobal.__tuturuuuAppBase = '/teach';
    expect(
      appApiPath('/api/v1/workspaces/ws/course-modules/mod/vocabulary')
    ).toBe('/teach/api/v1/workspaces/ws/course-modules/mod/vocabulary');
    expect(appApiPath('/api/v1/vocabulary/suggestions?q=apple')).toBe(
      '/teach/api/v1/vocabulary/suggestions?q=apple'
    );
    expect(appApiPath('/api/v1/vocabulary/images?q=apple')).toBe(
      '/teach/api/v1/vocabulary/images?q=apple'
    );
    expect(appApiPath('/api/v1/vocabulary/details?word=apple')).toBe(
      '/teach/api/v1/vocabulary/details?word=apple'
    );
    expect(appApiPath('/api/ai/objects/flashcards')).toBe(
      '/teach/api/ai/objects/flashcards'
    );
    expect(appApiPath('/api/ai/objects/quizzes')).toBe(
      '/teach/api/ai/objects/quizzes'
    );
  });

  it('mountedFetch keeps the query on the mounted path', async () => {
    baseGlobal.__tuturuuuAppBase = '/teach';
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await mountedFetch('/api/v1/vocabulary/suggestions?q=apple');
    expect(fetchMock).toHaveBeenCalledWith(
      '/teach/api/v1/vocabulary/suggestions?q=apple',
      undefined
    );
  });
});
