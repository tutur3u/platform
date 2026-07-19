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
        wsId="workspace-id"
      />
    );

    expect(screen.getByText('Standalone workspace picker')).toBeTruthy();
    expect(
      screen
        .getByText('Standalone workspace picker')
        .closest('[data-sidebar-workspace-select]')
    ).toBeTruthy();
  });
});
