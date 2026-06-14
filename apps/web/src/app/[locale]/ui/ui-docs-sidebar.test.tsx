import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SidebarGroup, SidebarLabels } from './ui-docs-nav-data';
import { UiDocsSidebarNav } from './ui-docs-sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/ui/components/button',
}));

const labels: SidebarLabels = {
  overview: 'Overview',
  setup: 'Setup',
  components: 'Components',
  contributing: 'Contributing',
  fullDocs: 'Full documentation',
  search: 'Search components',
  searchPlaceholder: 'Button, dialog, table...',
  empty: 'No components found',
  emptyHint: 'Clear the search to browse every component.',
  menu: 'Menu',
  title: 'Tuturuuu UI',
  description: 'Setup, discovery, and component reference.',
  commandTrigger: 'Search components',
  commandPlaceholder: 'Search every component...',
  commandEmpty: 'No components found',
  commandHint: 'Jump to any component.',
};

const groups: SidebarGroup[] = [
  {
    category: 'actions',
    label: 'Actions',
    items: [{ slug: 'button', name: 'Button' }],
  },
  {
    category: 'overlays',
    label: 'Overlays',
    items: [{ slug: 'drawer', name: 'Drawer' }],
  },
];

function renderSidebar() {
  return render(
    <UiDocsSidebarNav groups={groups} labels={labels} locale="en" total={2} />
  );
}

describe('UiDocsSidebarNav', () => {
  it('renders primary docs links and component links', () => {
    renderSidebar();

    const primaryNav = screen.getByTestId('ui-docs-primary-nav');
    expect(
      within(primaryNav).getByRole('link', { name: /overview/i })
    ).toHaveAttribute('href', '/en/ui');
    expect(
      within(primaryNav).getByRole('link', { name: /Components/i })
    ).toHaveAttribute('href', '/en/ui/components');
    expect(screen.getByRole('link', { name: 'Button' })).toHaveAttribute(
      'href',
      '/en/ui/components/button'
    );
  });

  it('filters component discovery and shows an empty state', () => {
    renderSidebar();

    fireEvent.change(screen.getByLabelText('Search components'), {
      target: { value: 'drawer' },
    });

    expect(screen.getByRole('link', { name: 'Drawer' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Button' })
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search components'), {
      target: { value: 'no-such-component' },
    });

    expect(screen.getByText('No components found')).toBeInTheDocument();
  });
});
