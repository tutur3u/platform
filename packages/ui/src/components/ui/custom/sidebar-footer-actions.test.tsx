// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/web/messages/en.json';
import { SidebarFooterActions } from './sidebar-footer-actions';
import { AccountHubProvider, useAccountHub } from './sidebar-footer-context';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock('../report-problem-dialog', () => ({
  ReportProblemDialog: () => null,
}));
vi.mock('./upgrade-dialog', () => ({ UpgradeDialog: () => null }));

function Probe() {
  const upgrade = useAccountHub()?.state.upgrade;
  return <output data-testid="upgrade">{upgrade?.label ?? 'none'}</output>;
}

function renderActions(props: {
  isFreeTier?: boolean | null;
  showUpgrade: boolean;
}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <NuqsTestingAdapter>
          <AccountHubProvider>
            <SidebarFooterActions wsId="ws" {...props} />
            <Probe />
          </AccountHubProvider>
        </NuqsTestingAdapter>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);

describe('SidebarFooterActions upgrade entry', () => {
  it('offers Upgrade to free workspaces', () => {
    renderActions({ isFreeTier: true, showUpgrade: true });
    expect(screen.getByTestId('upgrade').textContent).toBe('Upgrade');
  });

  it('offers Current plan to paid workspaces', () => {
    renderActions({ isFreeTier: false, showUpgrade: true });
    expect(screen.getByTestId('upgrade').textContent).toBe('Current plan');
  });

  it('omits the entry where an app opts out', () => {
    renderActions({ isFreeTier: false, showUpgrade: false });
    expect(screen.getByTestId('upgrade').textContent).toBe('none');
  });

  it('publishes no entry while the tier is unknown', () => {
    renderActions({ isFreeTier: undefined, showUpgrade: true });
    expect(screen.getByTestId('upgrade').textContent).toBe('none');
    cleanup();
    renderActions({ isFreeTier: null, showUpgrade: true });
    expect(screen.getByTestId('upgrade').textContent).toBe('none');
  });
});
