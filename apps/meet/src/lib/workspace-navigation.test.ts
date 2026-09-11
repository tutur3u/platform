import { describe, expect, it, vi } from 'vitest';
import { resolveMeetWorkspacePath } from './workspace-navigation';

vi.mock('@/i18n/routing', () => ({ supportedLocales: ['en', 'vi'] }));

describe('Meet workspace switching', () => {
  it.each([
    ['/personal/meetings', '/internal/meetings'],
    ['/vi/personal/meetings', '/vi/internal/meetings'],
    ['/en/personal/plans', '/en/internal/plans'],
    ['/workspace/personal/plans', '/internal/plans'],
    ['/vi/workspace/personal/meetings', '/vi/internal/meetings'],
  ])('switches %s while retaining the section and locale', (path, expected) => {
    expect(
      resolveMeetWorkspacePath({ currentPathname: path, nextSlug: 'internal' })
    ).toBe(expected);
  });
  it('can return from a team to Personal', () => {
    expect(
      resolveMeetWorkspacePath({
        currentPathname: '/internal/meetings',
        nextSlug: 'personal',
      })
    ).toBe('/personal/meetings');
  });
});
