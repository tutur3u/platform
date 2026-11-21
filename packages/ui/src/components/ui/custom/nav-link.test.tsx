import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavLink } from './nav-link';

const navigationState = vi.hoisted(() => ({
  pathname: '/personal/tasks',
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ prefetch: navigationState.prefetch }),
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
    Pick<
      ComponentProps<typeof NavLink>,
      'isCollapsed' | 'onClick' | 'onSubMenuClick'
    >
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
        isCollapsed={props.isCollapsed ?? false}
        onClick={props.onClick ?? vi.fn()}
        onSubMenuClick={props.onSubMenuClick ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('NavLink', () => {
  beforeEach(() => {
    navigationState.pathname = '/personal/tasks';
    navigationState.prefetch.mockReset();
    vi.restoreAllMocks();
  });

  it('prefetches internal routes only after navigation intent', () => {
    renderNavLink({
      href: '/personal/tasks/boards',
      title: 'Boards',
    });

    const link = screen.getByRole('link', { name: 'Boards' });
    expect(navigationState.prefetch).not.toHaveBeenCalled();

    fireEvent.mouseEnter(link);
    fireEvent.focus(link);

    expect(navigationState.prefetch).toHaveBeenCalledTimes(1);
    expect(navigationState.prefetch).toHaveBeenCalledWith(
      '/personal/tasks/boards'
    );
  });

  it('gives collapsed icon links a spoken navigation label', () => {
    renderNavLink(
      { href: '/personal/tasks/boards', title: 'Boards' },
      { isCollapsed: true }
    );

    expect(screen.getByRole('link', { name: 'Boards' })).toHaveAttribute(
      'aria-label',
      'Boards'
    );
  });

  it('shows a one-line caption under the icon in the collapsed rail', () => {
    navigationState.pathname = '/personal/calendar';

    renderNavLink(
      {
        href: '/personal/calendar',
        icon: <svg aria-hidden="true" data-testid="calendar-icon" />,
        title: 'Calendar',
      },
      { isCollapsed: true }
    );

    const link = screen.getByRole('link', { name: 'Calendar' });
    const label = within(link).getByText('Calendar');

    expect(label).toBeVisible();
    expect(label).toHaveAttribute('data-slot', 'sidebar-item-label');
    expect(label).toHaveClass('truncate', 'text-[10px]');
    expect(label).not.toHaveClass('text-muted-foreground');
    expect(link).toHaveClass('flex-col', 'bg-accent');
  });

  it('mutes the collapsed caption of inactive links', () => {
    renderNavLink(
      { href: '/personal/calendar', title: 'Calendar' },
      { isCollapsed: true }
    );

    expect(
      within(screen.getByRole('link', { name: 'Calendar' })).getByText(
        'Calendar'
      )
    ).toHaveClass('text-muted-foreground');
  });

  it('keeps the full title in the collapsed tooltip and the accessible name', async () => {
    const title = 'Workspace analytics and reporting';

    renderNavLink(
      { href: '/personal/analytics', title },
      { isCollapsed: true }
    );

    const link = screen.getByRole('link', { name: title });
    expect(link).toHaveAccessibleName(title);
    expect(within(link).getAllByText(title)).toHaveLength(1);

    fireEvent.focus(link);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(title);
  });

  it('renders the title once when expanded, without a tooltip', () => {
    renderNavLink({ href: '/personal/calendar', title: 'Calendar' });

    const link = screen.getByRole('link', { name: 'Calendar' });

    expect(link).not.toHaveAttribute('aria-label');
    expect(within(link).getAllByText('Calendar')).toHaveLength(1);
    expect(within(link).getByText('Calendar')).not.toHaveClass('text-[10px]');
    expect(link).not.toHaveClass('flex-col');

    fireEvent.focus(link);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not prefetch external routes', () => {
    renderNavLink({
      external: true,
      href: 'https://docs.tuturuuu.com',
      title: 'Docs',
    });

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Docs' }));

    expect(navigationState.prefetch).not.toHaveBeenCalled();
  });

  it.each([
    ['protocol-relative', '//docs.tuturuuu.com/guide'],
    ['email', 'mailto:support@tuturuuu.com'],
    ['telephone', 'tel:+84123456789'],
  ])('does not prefetch %s URLs', (_label, href) => {
    renderNavLink({ href, title: 'External destination' });

    fireEvent.mouseEnter(
      screen.getByRole('link', { name: 'External destination' })
    );

    expect(navigationState.prefetch).not.toHaveBeenCalled();
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

  it('dispatches the settings dialog open intent without navigating', () => {
    const onClick = vi.fn();
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

    renderNavLink(
      {
        openSettingsDialog: true,
        title: 'Settings',
      },
      { onClick }
    );

    fireEvent.click(screen.getByText('Settings'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tuturuuu:settings-dialog-open-intent',
      })
    );
  });

  it('passes the requested tab when opening settings from navigation', () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

    renderNavLink({
      openSettingsDialog: { tab: 'workspace_billing' },
      title: 'Billing',
    });

    fireEvent.click(screen.getByText('Billing'));

    const event = dispatchEvent.mock.calls.find(
      ([candidate]) =>
        candidate instanceof CustomEvent &&
        candidate.type === 'tuturuuu:settings-dialog-open-intent'
    )?.[0];

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.cancelable).toBe(true);
    expect((event as CustomEvent).detail).toEqual({
      settingsTab: 'workspace_billing',
    });
  });
});
