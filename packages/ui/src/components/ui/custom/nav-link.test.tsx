import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavLink } from './nav-link';

const navigationState = vi.hoisted(() => ({
  pathname: '/personal/tasks',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceConfigIdList: vi.fn(),
}));

function renderNavLink(
  link: ComponentProps<typeof NavLink>['link'],
  props: Partial<
    Pick<ComponentProps<typeof NavLink>, 'onClick' | 'onSubMenuClick'>
  > = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NavLink
        wsId="personal"
        link={link}
        isCollapsed={false}
        onClick={props.onClick ?? vi.fn()}
        onSubMenuClick={props.onSubMenuClick ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('NavLink', () => {
  beforeEach(() => {
    navigationState.pathname = '/personal/tasks';
  });

  it('matches wildcard aliases even when the primary route is exact', () => {
    navigationState.pathname = '/personal/tasks/boards/board-1';

    renderNavLink({
      aliases: ['/personal/tasks/boards/*'],
      href: '/personal/tasks',
      matchExact: true,
      title: 'Tasks',
    });

    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveClass(
      'bg-accent',
      'text-accent-foreground'
    );
  });

  it('keeps exact primary routes from matching unrelated subroutes', () => {
    navigationState.pathname = '/personal/tasks/progress';

    renderNavLink({
      aliases: ['/personal/tasks/boards/*'],
      href: '/personal/tasks',
      matchExact: true,
      title: 'Tasks',
    });

    expect(screen.getByRole('link', { name: 'Tasks' })).not.toHaveClass(
      'bg-accent'
    );
  });

  it('does not mark cross-origin links active just because the path matches', () => {
    navigationState.pathname = '/personal';

    renderNavLink({
      href: 'https://mail.tuturuuu.com/personal',
      title: 'Mail',
    });

    expect(screen.getByRole('link', { name: 'Mail' })).not.toHaveClass(
      'bg-accent'
    );
  });

  it('navigates through the parent link instead of opening a single-child submenu', () => {
    const onClick = vi.fn();
    const onSubMenuClick = vi.fn();

    renderNavLink(
      {
        children: [{ href: '/personal/tasks/boards', title: 'Boards' }],
        href: '/personal/tasks',
        title: 'Tasks',
      },
      { onClick, onSubMenuClick }
    );

    const link = screen.getByRole('link', { name: 'Tasks' });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubMenuClick).not.toHaveBeenCalled();
  });
});
