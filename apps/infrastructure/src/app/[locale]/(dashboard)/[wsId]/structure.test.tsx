import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Structure } from './structure';

const mocks = vi.hoisted(() => ({
  webAppUrl: 'https://platform.example',
}));

vi.mock('@/constants/common', () => ({
  TTR_URL: 'https://platform.example',
  WEB_APP_URL: mocks.webAppUrl,
}));

vi.mock('@tuturuuu/satellite/sidebar-structure', () => ({
  SidebarStructure: ({
    brand,
    children,
    workspaceSelect,
  }: {
    brand: ReactNode;
    children: ReactNode;
    workspaceSelect?: () => ReactNode;
  }) => (
    <section>
      <div data-testid="brand-slot">{brand}</div>
      <div data-testid="workspace-slot">{workspaceSelect?.()}</div>
      {children}
    </section>
  ),
}));

vi.mock('@tuturuuu/satellite/fixed-app-brand', () => ({
  FixedAppBrand: ({
    appHref,
    appName,
    centralHref,
  }: {
    appHref: string;
    appName: ReactNode;
    centralHref: string;
  }) => (
    <div>
      <a href={centralHref}>Tuturuuu</a>
      <a href={appHref}>{appName}</a>
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: () => <span data-testid="tuturuuu-logo" />,
}));

describe('Infrastructure Structure', () => {
  it('renders a fixed Tuturuuu and Infra brand without a workspace selector', () => {
    render(
      <Structure
        actions={<div />}
        defaultCollapsed={false}
        links={[]}
        userPopover={<div />}
        workspace={{ tier: 'FREE' }}
        wsId="internal"
      >
        <div>Infrastructure dashboard</div>
      </Structure>
    );

    const link = screen.getByRole('link', { name: 'Tuturuuu' });

    expect(link).toHaveAttribute('href', mocks.webAppUrl);
    expect(screen.getByRole('link', { name: 'Infra' })).toHaveAttribute(
      'href',
      '/internal'
    );
    expect(screen.getByTestId('brand-slot')).toContainElement(link);
    expect(screen.getByTestId('workspace-slot')).toBeEmptyDOMElement();
    expect(screen.getByText('Infrastructure dashboard')).toBeInTheDocument();
  });
});
