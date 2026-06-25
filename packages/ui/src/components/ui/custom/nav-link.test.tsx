import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

function renderNavLink(link: ComponentProps<typeof NavLink>['link']) {
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
        onClick={vi.fn()}
        onSubMenuClick={vi.fn()}
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
});
