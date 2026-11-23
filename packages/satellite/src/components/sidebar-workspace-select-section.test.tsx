import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarWorkspaceSelectSection } from './sidebar-workspace-select-section';

describe('SidebarWorkspaceSelectSection', () => {
  it('keeps the selector permanently in flow with a fixed row geometry', () => {
    const { container } = render(
      <SidebarWorkspaceSelectSection>
        <span>Workspace selector</span>
      </SidebarWorkspaceSelectSection>
    );

    const section = container.querySelector('[data-sidebar-workspace-select]');

    expect(section?.hasAttribute('aria-hidden')).toBe(false);
    expect(section?.hasAttribute('inert')).toBe(false);
    expect(section?.hasAttribute('data-state')).toBe(false);
    expect(section?.className).toContain('px-2');
    expect(section?.className).toContain('pb-2');
    expect(section?.className).not.toContain('grid-rows');
    expect(section?.className).not.toContain('opacity-0');
  });

  it('renders nothing when the app has no selector', () => {
    const { container } = render(
      <SidebarWorkspaceSelectSection visible={false}>
        <span>Workspace selector</span>
      </SidebarWorkspaceSelectSection>
    );

    expect(
      container.querySelector('[data-sidebar-workspace-select]')
    ).toBeNull();
  });
});
