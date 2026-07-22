import { fireEvent, render, screen } from '@testing-library/react';
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
});
