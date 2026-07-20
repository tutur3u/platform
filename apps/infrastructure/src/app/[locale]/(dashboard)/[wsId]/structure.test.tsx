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
    appId,
    brandHref,
    children,
    workspaceSelect,
  }: {
    appId: string;
    brandHref: string;
    children: ReactNode;
    workspaceSelect?: () => ReactNode;
  }) => (
    <section>
      <a href={brandHref}>Tuturuuu</a>
      <div data-testid="app-name">{appId}</div>
      <div data-testid="workspace-slot">{workspaceSelect?.()}</div>
      {children}
    </section>
  ),
}));

describe('Infrastructure Structure', () => {
  it('renders the shared Tuturuuu and Infrastructure brand without a workspace selector', () => {
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
    expect(screen.getByTestId('app-name')).toHaveTextContent('infrastructure');
    expect(screen.getByTestId('workspace-slot')).toBeEmptyDOMElement();
    expect(screen.getByText('Infrastructure dashboard')).toBeInTheDocument();
  });
});
