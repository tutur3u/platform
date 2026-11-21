import { fireEvent, render, screen, within } from '@testing-library/react';
import { satelliteNavigationItemClass } from '@tuturuuu/ui/custom/satellite-navigation';
import { describe, expect, it, vi } from 'vitest';
import { SidebarSettingsButton } from './sidebar-settings-button';

describe('SidebarSettingsButton', () => {
  it('opens the shared settings dialog from the sidebar footer', () => {
    const listener = vi.fn();
    window.addEventListener('tuturuuu:settings-dialog-open-intent', listener);

    render(<SidebarSettingsButton isCollapsed={false} label="Settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      'tuturuuu:settings-dialog-open-intent',
      listener
    );
  });

  it.each([false, true])(
    'uses the sidebar nav item shape (collapsed: %s)',
    (isCollapsed) => {
      const { container, unmount } = render(
        <SidebarSettingsButton isCollapsed={isCollapsed} label="Settings" />
      );

      expect(
        within(container).getByRole('button', { name: 'Settings' }).className
      ).toBe(satelliteNavigationItemClass({ isCollapsed }));
      unmount();
    }
  );

  it('captions the collapsed rail button under its icon', () => {
    const { container } = render(
      <SidebarSettingsButton isCollapsed label="Settings" />
    );

    const button = within(container).getByRole('button', { name: 'Settings' });

    expect(within(button).getByText('Settings').getAttribute('data-slot')).toBe(
      'sidebar-item-label'
    );
    expect(within(button).getAllByText('Settings')).toHaveLength(1);
  });
});
