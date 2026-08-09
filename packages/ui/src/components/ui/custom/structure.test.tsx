import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Structure } from './structure';

describe('Structure', () => {
  it('removes sidebar chrome and desktop padding when the sidebar is hidden', () => {
    const { container } = render(
      <Structure
        isCollapsed
        setIsCollapsed={vi.fn()}
        mobileHeader={<span>Mobile header</span>}
        sidebarContent={<span>Sidebar content</span>}
        sidebarHeader={<span>Sidebar header</span>}
        sidebarHidden
      >
        <span>Page content</span>
      </Structure>
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.queryByText('Mobile header')).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar header')).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar content')).not.toBeInTheDocument();
    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(container.querySelector('nav')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('md:pl-0');
    expect(screen.getByText('Page content').parentElement).toHaveClass(
      'p-2',
      'md:p-4'
    );
  });

  it('keeps the account and notification controls in the collapsed footer', () => {
    const { container } = render(
      <Structure
        actions={<span>Expanded account actions</span>}
        isCollapsed
        notificationPopover={<button type="button">Notifications</button>}
        setIsCollapsed={vi.fn()}
        userPopover={<button type="button">Account</button>}
      >
        <span>Page content</span>
      </Structure>
    );

    const sidebar = container.querySelector('aside');
    expect(sidebar).not.toBeNull();
    const sidebarQueries = within(sidebar as HTMLElement);

    expect(
      sidebarQueries.getByRole('button', { name: 'Account' })
    ).toBeVisible();
    expect(
      sidebarQueries.getByRole('button', { name: 'Notifications' })
    ).toBeVisible();
    expect(
      sidebarQueries.queryByText('Expanded account actions')
    ).not.toBeInTheDocument();
  });

  it('renders the combined account actions only once when expanded', () => {
    const { container } = render(
      <Structure
        actions={<span>Expanded account actions</span>}
        isCollapsed={false}
        notificationPopover={<button type="button">Notifications</button>}
        setIsCollapsed={vi.fn()}
        userPopover={<button type="button">Account</button>}
      >
        <span>Page content</span>
      </Structure>
    );

    const sidebar = container.querySelector('aside');
    expect(sidebar).not.toBeNull();
    const sidebarQueries = within(sidebar as HTMLElement);

    expect(sidebarQueries.getByText('Expanded account actions')).toBeVisible();
    expect(
      sidebarQueries.queryByRole('button', { name: 'Notifications' })
    ).not.toBeInTheDocument();
    expect(
      sidebarQueries.queryByRole('button', { name: 'Account' })
    ).not.toBeInTheDocument();
  });
});
