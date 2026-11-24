// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { WorkspaceUpgradeOptions } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/web/messages/en.json';
import { AccountHubActionItems } from './account-hub-ui';
import { SatelliteFooterActions } from './satellite-footer-actions';
import { SatelliteUserMenu } from './satellite-user-menu';
import { AccountHubProvider } from './sidebar-footer-context';
import { UpgradeDialog } from './upgrade-dialog';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  getWorkspaceUpgradeOptions: mocks.load,
}));

const plan = (over: Partial<WorkspaceUpgradeOptions['plans'][number]>) => ({
  billingCycle: 'year' as const,
  description: null,
  id: 'id',
  maxSeats: null,
  minSeats: 1,
  name: 'Plan',
  price: 0,
  pricePerSeat: 5000,
  pricingModel: 'seat_based',
  tier: 'PLUS',
  ...over,
});

const options = (
  currentPlan: WorkspaceUpgradeOptions['currentPlan'] = null
): WorkspaceUpgradeOptions => ({
  billingUrl: 'https://pay.example/ws/billing',
  currentPlan,
  plans: [
    plan({
      billingCycle: null,
      id: 'free',
      name: 'Free',
      pricePerSeat: null,
      pricingModel: 'free',
      tier: 'FREE',
    }),
    plan({
      description: 'Team features',
      id: 'plus-y',
      name: 'Tuturuuu Workspace Plus Yearly',
    }),
    plan({
      id: 'plus-m',
      billingCycle: 'month',
      name: 'Plus Monthly',
      pricePerSeat: 500,
    }),
    plan({ id: 'pro-y', name: 'Pro Yearly', pricePerSeat: 9000, tier: 'PRO' }),
  ],
});

function renderDialog(search = '?upgradeDialog=open') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <NuqsTestingAdapter searchParams={search}>
          <UpgradeDialog billingFallbackHref="/ws/billing" wsId="ws" />
        </NuqsTestingAdapter>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('account menu Upgrade entry', () => {
  it('opens the dialog callback instead of linking to billing', async () => {
    const onUpgrade = vi.fn();
    render(
      <AccountHubProvider>
        <SatelliteFooterActions
          labels={{ feedback: 'Feedback', upgrade: 'Upgrade' }}
          onFeedback={vi.fn()}
          onUpgrade={onUpgrade}
          showUpgrade
          wsId="ws"
        />
        <SatelliteUserMenu email="a@example.com" label="Account" name="A">
          <AccountHubActionItems />
        </SatelliteUserMenu>
      </AccountHubProvider>
    );
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Account' }), {
      key: 'Enter',
    });
    const item = screen.getByRole('menuitem', { name: 'Upgrade' });
    expect(item.getAttribute('href')).toBeNull();
    fireEvent.click(item);
    await waitFor(() => expect(onUpgrade).toHaveBeenCalledOnce());
  });
});

describe('UpgradeDialog', () => {
  it('stays closed without the URL flag', () => {
    renderDialog('');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('lists plans for the cycle, marks the current plan and hands off checkout', async () => {
    mocks.load.mockResolvedValue(
      options({
        billingCycle: 'year',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        name: 'Plus',
        productId: 'plus-y',
        seatCount: 3,
        status: 'active',
        tier: 'PLUS',
      })
    );
    renderDialog();
    expect(mocks.load).toHaveBeenCalledWith('ws');
    await screen.findByText('Continue to checkout', { exact: false });
    const plans = document.querySelector<HTMLElement>(
      '[data-slot="upgrade-plans"]'
    ) as HTMLElement;
    const items = within(plans).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const plus = items.find((item) => item.hasAttribute('data-current'));
    expect(plus && within(plus).getByText('Current plan')).toBeTruthy();
    expect(
      plus && within(plus).getByText('$50 per seat per year')
    ).toBeTruthy();
    const checkout = screen.getByRole('link', { name: /Continue to checkout/ });
    expect(checkout.getAttribute('href')).toBe(
      'https://pay.example/ws/billing?plan=pro-y'
    );
    expect(
      screen
        .getByRole('link', { name: /View full billing/ })
        .getAttribute('href')
    ).toBe('https://pay.example/ws/billing');
  });

  it('switches to monthly prices', async () => {
    mocks.load.mockResolvedValue(options());
    renderDialog();
    await screen.findAllByText('Continue to checkout', { exact: false });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    expect(await screen.findByText('$5 per seat per month')).toBeTruthy();
  });

  it('compares plans in a table with column and row headers', async () => {
    mocks.load.mockResolvedValue(options());
    renderDialog('?upgradeDialog=open&upgradeTab=compare');
    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Feature', 'Free', 'Plus', 'Pro']);
    expect(
      within(table).getByRole('rowheader', { name: 'Price' })
    ).toBeTruthy();
    expect(within(table).getByText('Team features')).toBeTruthy();
  });

  it('shows the Free plan as current when there is no subscription', async () => {
    mocks.load.mockResolvedValue(options());
    renderDialog('?upgradeDialog=open&upgradeTab=current');
    expect(
      await screen.findByText(/This workspace is on the Free plan/)
    ).toBeTruthy();
  });

  it('explains a missing permission without a retry', async () => {
    mocks.load.mockRejectedValue(
      Object.assign(new Error('no'), { status: 403 })
    );
    renderDialog();
    expect(
      await screen.findByText(/Only members who can manage subscriptions/)
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
