import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarStructureContent } from './sidebar-structure-content';

vi.mock('@tuturuuu/ui/custom/nav', () => ({
  Nav: () => <nav>Navigation</nav>,
}));

describe('SidebarStructureContent', () => {
  it('renders the workspace picker as a dedicated standalone section', () => {
    render(
      <SidebarStructureContent
        backButton={{ title: 'Back' }}
        filteredCurrentLinks={[]}
        isCollapsed={false}
        navState={{
          currentLinks: [],
          direction: 'forward',
          history: [],
          titleHistory: [],
        }}
        setIsCollapsed={vi.fn()}
        setNavState={vi.fn()}
        workspaceSelect={({ standalone }) => (
          <span>{standalone ? 'Standalone workspace picker' : 'Inline'}</span>
        )}
        workspaceSelectVisible
        wsId="workspace-id"
      />
    );

    expect(screen.getByText('Standalone workspace picker')).toBeTruthy();
    const workspaceSection = screen
      .getByText('Standalone workspace picker')
      .closest('[data-sidebar-workspace-select]');

    expect(workspaceSection).toBeTruthy();
    expect(workspaceSection?.getAttribute('aria-hidden')).toBe('false');
    expect(workspaceSection?.getAttribute('data-state')).toBe('open');
    expect(workspaceSection?.className).toContain('opacity-100');
    expect(workspaceSection?.className).not.toContain('pointer-events-none');
  });

  it('makes the workspace picker invisible and inert while closed', () => {
    render(
      <SidebarStructureContent
        backButton={{ title: 'Back' }}
        filteredCurrentLinks={[]}
        isCollapsed={false}
        navState={{
          currentLinks: [],
          direction: 'forward',
          history: [],
          titleHistory: [],
        }}
        setIsCollapsed={vi.fn()}
        setNavState={vi.fn()}
        workspaceSelect={() => <span>Hidden workspace picker</span>}
        workspaceSelectVisible={false}
        wsId="workspace-id"
      />
    );

    const workspaceSection = screen
      .getByText('Hidden workspace picker')
      .closest('[data-sidebar-workspace-select]');

    expect(workspaceSection?.getAttribute('aria-hidden')).toBe('true');
    expect(workspaceSection?.getAttribute('data-state')).toBe('closed');
    expect(workspaceSection?.hasAttribute('inert')).toBe(true);
    expect(workspaceSection?.className).toContain('opacity-0');
    expect(workspaceSection?.className).toContain('pointer-events-none');
    expect(workspaceSection?.className).toContain('grid-rows-[0fr]');
  });
});
