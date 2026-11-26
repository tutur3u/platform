import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Nav } from './nav';
import type { NavLink } from './navigation';

const navigationState = vi.hoisted(() => ({ pathname: '/personal/notes' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock('./nav-link', () => ({
  NavLink: ({ link }: { link: NavLink }) => (
    <a href={link.href}>{link.title}</a>
  ),
}));

const links: NavLink[] = [
  {
    href: '/personal/tasks',
    id: 'tasks',
    sectionCollapsible: true,
    sectionId: 'productivity',
    sectionLabel: 'Productivity',
    title: 'Tasks',
  },
  {
    href: '/personal/notes',
    id: 'notes',
    sectionCollapsible: true,
    sectionId: 'productivity',
    sectionLabel: 'Productivity',
    title: 'Notes',
  },
];

describe('Nav Next.js adapter', () => {
  beforeEach(() => {
    navigationState.pathname = '/personal/notes';
    window.localStorage.clear();
  });

  it('injects the Next pathname into SidebarNavigation for collapsible sections', () => {
    render(
      <Nav
        wsId="personal"
        isCollapsed={false}
        links={links}
        collapsibleSections
        onSubMenuClick={vi.fn()}
        onClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Productivity' }));

    expect(screen.queryByText('Tasks')).toBeNull();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });
});
