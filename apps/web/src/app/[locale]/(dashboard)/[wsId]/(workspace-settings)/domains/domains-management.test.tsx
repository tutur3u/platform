// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type {
  WorkspaceDomain,
  WorkspaceDomainsOverview,
} from '@tuturuuu/internal-api/workspace-domains';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../../messages/en.json';
import { DomainsManagement } from './domains-management';
import { summarize } from './entitlement-summary';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspace-domains', () => ({
  listWorkspaceDomains: mocks.list,
  addWorkspaceDomain: mocks.add,
  verifyWorkspaceDomain: mocks.verify,
  removeWorkspaceDomain: mocks.remove,
}));

const pending: WorkspaceDomain = {
  id: 'd1',
  hostname: 'example.com',
  kind: 'custom',
  status: 'pending_verification',
  ownershipStatus: 'pending',
  sslStatus: null,
  entitlementSource: 'staff_bypass',
  error: 'ownership_txt_missing',
  ownershipRecord: {
    type: 'TXT',
    name: '_tuturuuu-verify.example.com',
    value: 'tuturuuu-domain-verification=abc',
  },
  routingRecord: { type: 'CNAME', name: 'example.com', value: 'saas.ttr.gg' },
  providerRecords: [],
  createdAt: '2026-11-11T00:00:00.000Z',
  lastCheckedAt: null,
  activatedAt: null,
};

function overview(
  patch: Partial<WorkspaceDomainsOverview> = {}
): WorkspaceDomainsOverview {
  return {
    domains: [pending],
    entitlement: {
      allowed: true,
      reason: 'ok',
      source: 'staff_bypass',
      cap: 10,
      used: 1,
      total: 10,
      remaining: 9,
    },
    billing: { checkoutEnabled: false, pricePerDomainMonthlyUsd: 10 },
    cnameTarget: 'saas.ttr.gg',
    platformApex: 'ttr.gg',
    providerConfigured: true,
    canManage: true,
    ...patch,
  };
}

function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <DomainsManagement wsId="ws-a" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue(overview());
});

describe('DomainsManagement', () => {
  it('shows staff availability, DNS instructions and status', async () => {
    mount();
    expect(await screen.findByText('Tuturuuu staff access')).toBeVisible();
    expect(screen.getByText('Waiting for DNS')).toBeVisible();
    expect(screen.getByText('_tuturuuu-verify.example.com')).toBeVisible();
    expect(screen.getAllByText('saas.ttr.gg').length).toBeGreaterThan(0);
  });

  it('adds a hostname and reports API errors', async () => {
    mocks.add.mockRejectedValue(new InternalApiError('hostname_reserved', 400));
    mount();
    const input = await screen.findByLabelText('Hostname');
    fireEvent.change(input, { target: { value: 'www.ttr.gg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add domain' }));
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith('ws-a', 'www.ttr.gg')
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This hostname is reserved for Tuturuuu.'
    );
  });

  it('confirms before removing', async () => {
    mocks.remove.mockResolvedValue({
      id: 'd1',
      hostname: 'example.com',
      providerCleanupPending: false,
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove domain' }));
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('ws-a', 'd1')
    );
  });

  it('is read-only without the manage permission', async () => {
    mocks.list.mockResolvedValue(overview({ canManage: false }));
    mount();
    expect(
      await screen.findByText('You can view domains but not change them.')
    ).toBeVisible();
    expect(screen.queryByLabelText('Hostname')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('configuration hints', () => {
  it('shows the configured fallback origin and apex, or nothing', async () => {
    mocks.list.mockResolvedValue(
      overview({ cnameTarget: 'edge.example.net', platformApex: null })
    );
    mount();
    const help = await screen.findByText(/edge\.example\.net/u);
    expect(help).not.toHaveTextContent('ttr.gg');
  });

  it('explains when custom domains are not configured', async () => {
    mocks.list.mockResolvedValue(
      overview({ cnameTarget: null, platformApex: 'ttr.gg' })
    );
    mount();
    expect(
      await screen.findByText(
        /Custom domains are not configured on this deployment\./u
      )
    ).toHaveTextContent('Addresses under ttr.gg need no DNS changes.');
  });
});

describe('summarize', () => {
  const denied = (reason: string, checkoutEnabled = false) =>
    summarize(
      overview({
        entitlement: {
          allowed: false,
          reason,
          source: null,
          cap: 10,
          used: 0,
          total: 0,
          remaining: 0,
        },
        billing: { checkoutEnabled, pricePerDomainMonthlyUsd: 10 },
      })
    ).kind;

  it('keeps checkout hidden until billing is enabled', () => {
    expect(denied('paid_plan_required')).toBe('upgrade');
    expect(denied('billing_unavailable')).toBe('comingSoon');
    expect(denied('addon_required')).toBe('comingSoon');
    expect(denied('addon_required', true)).toBe('buyAddon');
    expect(denied('kill_switch')).toBe('paused');
    expect(denied('unavailable')).toBe('unavailable');
  });
});
