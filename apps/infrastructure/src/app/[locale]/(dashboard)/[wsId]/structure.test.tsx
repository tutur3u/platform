import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Structure } from './structure';

const mocks = vi.hoisted(() => ({
  webAppUrl: 'https://tuturuuu.example',
}));

vi.mock('@/constants/common', () => ({
  TTR_URL: 'https://platform.example',
  WEB_APP_URL: mocks.webAppUrl,
}));

vi.mock('@tuturuuu/satellite/sidebar-structure', () => ({
  SidebarStructure: ({
    children,
    workspaceSelect,
  }: {
    children: ReactNode;
    workspaceSelect: () => ReactNode;
  }) => (
    <section>
      <div data-testid="workspace-slot">{workspaceSelect()}</div>
      {children}
    </section>
  ),
}));

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: () => <span data-testid="tuturuuu-logo" />,
}));

describe('Infrastructure Structure', () => {
  it('replaces the workspace picker slot with a Tuturuuu logo link', () => {
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
    expect(screen.getByTestId('workspace-slot')).toContainElement(link);
    expect(screen.getByText('Infrastructure dashboard')).toBeInTheDocument();
  });
});
