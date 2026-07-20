import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarStructureHeader } from './sidebar-structure-header';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'command_launcher' && key === 'app_names.mail') {
      return 'Thư';
    }

    return 'Home';
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href: string } & ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: (props: ComponentProps<'img'>) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt="" {...props} />
  ),
}));

const baseProps = {
  appHref: '/mail',
  appId: 'mail' as const,
  brandHref: '/',
  hideWorkspaceSelectLabel: 'Hide workspace selector',
  isCollapsed: false,
  launcherLabel: 'Open apps',
  onOpenApps: vi.fn(),
  showWorkspaceSelectLabel: 'Show workspace selector',
  workspaceSelectVisible: false,
};

afterEach(cleanup);

describe('SidebarStructureHeader', () => {
  it('renders the shared brand and app launcher trigger', () => {
    render(<SidebarStructureHeader {...baseProps} />);

    expect(screen.getByText('Thư')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Tuturuuu' }).getAttribute('href')
    ).toBe('/');
    expect(screen.getByRole('button', { name: 'Open apps' })).toBeTruthy();
  });

  it('collapses to the Tuturuuu home link', () => {
    render(<SidebarStructureHeader {...baseProps} isCollapsed />);

    expect(
      screen.getByRole('link', { name: 'Home' }).getAttribute('href')
    ).toBe('/');
    expect(screen.queryByRole('button', { name: 'Open apps' })).toBeNull();
  });

  it('exposes an accessible workspace picker visibility control', () => {
    const onToggleWorkspaceSelect = vi.fn();
    const { rerender } = render(
      <SidebarStructureHeader
        {...baseProps}
        onToggleWorkspaceSelect={onToggleWorkspaceSelect}
      />
    );

    const showButton = screen.getByRole('button', {
      name: 'Show workspace selector',
    });
    expect(showButton.getAttribute('aria-expanded')).toBe('false');
    expect(showButton.getAttribute('aria-controls')).toBe(
      'sidebar-workspace-selector'
    );

    fireEvent.click(showButton);
    expect(onToggleWorkspaceSelect).toHaveBeenCalledOnce();

    rerender(
      <SidebarStructureHeader
        {...baseProps}
        onToggleWorkspaceSelect={onToggleWorkspaceSelect}
        workspaceSelectVisible
      />
    );
    expect(
      screen.getByRole('button', { name: 'Hide workspace selector' })
    ).toBeTruthy();
  });
});
