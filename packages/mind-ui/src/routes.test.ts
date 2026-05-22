import { describe, expect, it } from 'vitest';
import { buildMindBoardHref, buildMindWorkspaceHref } from './routes';

describe('Mind route helpers', () => {
  it('keeps standalone Mind routes unprefixed', () => {
    expect(buildMindWorkspaceHref({ workspaceSlug: 'personal' })).toBe(
      '/personal'
    );
    expect(
      buildMindBoardHref({ boardId: 'board-1', workspaceSlug: 'personal' })
    ).toBe('/personal/boards/board-1');
  });

  it('adds the apps/web Mind route prefix when hosted inside the web dashboard', () => {
    expect(
      buildMindWorkspaceHref({
        mindPrefix: '/mind',
        workspaceSlug: 'personal',
      })
    ).toBe('/personal/mind');
    expect(
      buildMindBoardHref({
        boardId: 'board-1',
        mindPrefix: '/mind',
        workspaceSlug: 'personal',
      })
    ).toBe('/personal/mind/boards/board-1');
  });
});
