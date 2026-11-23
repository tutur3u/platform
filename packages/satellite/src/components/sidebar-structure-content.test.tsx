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
    const workspaceSection = screen
      .getByText('Standalone workspace picker')
      .closest('[data-sidebar-workspace-select]');

    expect(workspaceSection).toBeTruthy();
    expect(workspaceSection?.hasAttribute('aria-hidden')).toBe(false);
    expect(workspaceSection?.hasAttribute('inert')).toBe(false);
    expect(workspaceSection?.className).not.toContain('opacity-0');
  });

  it('renders no workspace picker row for apps without one', () => {
    const { container } = render(
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
        wsId="workspace-id"
      />
    );

    expect(
      container.querySelector('[data-sidebar-workspace-select]')
    ).toBeNull();
  });

  it('slides navigation only after it changes while mounted', () => {
    const baseState = {
      currentLinks: [],
      direction: 'forward' as const,
      history: [] as never[],
      titleHistory: [] as string[],
    };
    const props = {
      backButton: { title: 'Back' },
      filteredCurrentLinks: [],
      isCollapsed: false,
      setIsCollapsed: vi.fn(),
      setNavState: vi.fn(),
      wsId: 'workspace-id',
    };
    const { container, rerender } = render(
      <SidebarStructureContent {...props} navState={baseState} />
    );
    const slide = () => container.querySelector('.animate-in');

    expect(slide()).toBeNull();

    rerender(
      <SidebarStructureContent
        {...props}
        navState={{ ...baseState, history: [[]], titleHistory: ['Tasks'] }}
      />
    );
    expect(slide()?.className).toContain('slide-in-from-right');
  });
});
