import { cleanup, render, screen } from '@testing-library/react';
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
  TuturuuLogo: (props: ComponentProps<'img'>) => <img alt="" {...props} />,
}));

const baseProps = {
  appHref: '/mail',
  appId: 'mail' as const,
  brandHref: '/',
  isCollapsed: false,
  launcherLabel: 'Open apps',
  onOpenApps: vi.fn(),
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

  it('collapses to the Home link', () => {
    render(<SidebarStructureHeader {...baseProps} isCollapsed />);

    expect(
      screen.getByRole('link', { name: 'Home' }).getAttribute('href')
    ).toBe('/');
    expect(screen.queryByRole('button', { name: 'Open apps' })).toBeNull();
  });

  it('has no workspace picker show/hide control', () => {
    render(<SidebarStructureHeader {...baseProps} />);

    expect(
      screen.queryByRole('button', { name: /workspace selector/i })
    ).toBeNull();
  });
});
