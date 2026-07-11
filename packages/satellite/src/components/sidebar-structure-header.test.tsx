import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarStructureHeader } from './sidebar-structure-header';

vi.mock('next-intl', () => ({
  useTranslations: () => () => 'Home',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: (props: ComponentProps<'img'>) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt="" {...props} />
  ),
}));

const baseProps = {
  brandHref: '/',
  isCollapsed: false,
  wsId: 'workspace-id',
};

describe('SidebarStructureHeader', () => {
  it('supports focused satellite shells without a workspace selector', () => {
    render(<SidebarStructureHeader {...baseProps} brand={<span>Mail</span>} />);

    expect(screen.getByText('Mail')).toBeTruthy();
    expect(screen.queryByText('Workspace switcher')).toBeNull();
  });

  it('still renders workspace selectors for workspace-oriented apps', () => {
    render(
      <SidebarStructureHeader
        {...baseProps}
        brand={<span>Calendar</span>}
        workspaceSelect={() => <span>Workspace switcher</span>}
      />
    );

    expect(screen.getByText('Workspace switcher')).toBeTruthy();
  });
});
