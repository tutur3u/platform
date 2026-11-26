import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavLink } from './navigation';
import { SidebarNavigation } from './satellite-navigation';

function section(
  id: string,
  label: string | undefined,
  titles: string[],
  extra: Partial<NavLink> = {}
): NavLink[] {
  return titles.map((title) => ({
    href: `/personal/${title.toLowerCase()}`,
    id: title.toLowerCase(),
    sectionCollapsible: Boolean(label),
    sectionId: id,
    sectionLabel: label,
    title,
    ...extra,
  }));
}

const links: (NavLink | null)[] = [
  ...section('overview', undefined, ['Dashboard']),
  ...section('productivity', 'Productivity', ['Tasks', 'Notes']),
  ...section('communication', 'Communication', ['Mail']),
  null,
  { href: '/personal/settings', id: 'settings', title: 'Settings' },
];

function renderSidebar(
  props: Partial<Parameters<typeof SidebarNavigation>[0]> = {}
) {
  return render(
    <SidebarNavigation
      collapsibleSections
      isCollapsed={false}
      links={links}
      pathname="/personal"
      renderLink={(link) => <a href={link.href}>{link.title}</a>}
      {...props}
    />
  );
}

describe('SidebarNavigation collapsible sections', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders each section header once, with the header-less overview first', () => {
    renderSidebar();

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Productivity' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('collapses a section, remembers it, and keeps the active page visible', () => {
    const { unmount } = renderSidebar({ pathname: '/personal/notes' });

    fireEvent.click(screen.getByRole('button', { name: 'Productivity' }));

    expect(
      screen.getByRole('button', { name: 'Productivity' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Tasks')).toBeNull();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Mail')).toBeInTheDocument();

    unmount();
    renderSidebar({ pathname: '/personal/notes' });

    expect(
      screen.getByRole('button', { name: 'Productivity' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Tasks')).toBeNull();
    expect(screen.getByText('Notes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Productivity' }));
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('shows every icon in the collapsed rail and keeps headers out of reach', () => {
    const { container } = renderSidebar({ isCollapsed: true });

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelectorAll('span.border-t')).toHaveLength(2);
    expect(
      screen.getByText('Productivity').closest('[aria-hidden]')
    ).not.toBeNull();
    for (const title of ['Dashboard', 'Tasks', 'Notes', 'Mail', 'Settings']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('survives unavailable storage by rendering every section open', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    renderSidebar();

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    getItem.mockRestore();
  });
});

describe('SidebarNavigation framework independence', () => {
  it.each([
    './satellite-navigation.tsx',
    './nav-link-matching.ts',
    './sidebar-collapsed-sections.ts',
  ])('keeps %s free of framework runtime imports', (relativePath) => {
    const source = readFileSync(resolve(__dirname, relativePath), 'utf8');

    expect(source).not.toMatch(
      /from\s+['"](?:next(?:\/|$)|next-intl(?:\/|$)|react-router(?:\/|$)|@tanstack\/react-router(?:\/|$)|cloudflare:)/
    );
  });
});

describe('SidebarNavigation without collapsible sections', () => {
  it('keeps the plain label-change headers other apps rely on', () => {
    render(
      <SidebarNavigation
        isCollapsed={false}
        links={[
          { href: '/a', sectionLabel: 'Group', title: 'A' },
          { href: '/b', sectionLabel: 'Group', title: 'B' },
        ]}
        renderLink={(link) => <a href={link.href}>{link.title}</a>}
      />
    );

    expect(screen.getAllByText('Group')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
