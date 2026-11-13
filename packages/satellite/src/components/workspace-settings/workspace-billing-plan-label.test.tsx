import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanName } from './plan-name';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      {
        billing_plan_enterprise: 'Enterprise',
        billing_plan_free: 'Free',
        billing_plan_plus: 'Plus',
        billing_plan_pro: 'Pro',
      } as Record<string, string>
    )[key] ?? key,
}));

afterEach(() => {
  cleanup();
});

describe('PlanName', () => {
  it('shows the translated Pro name once and hides the raw tier code', () => {
    render(<PlanName tier="PRO" />);

    expect(screen.getAllByText('Pro')).toHaveLength(1);
    expect(screen.queryByText('PRO')).toBeNull();
  });

  it.each([
    ['FREE', 'Free'],
    ['PLUS', 'Plus'],
    ['ENTERPRISE', 'Enterprise'],
  ] as const)('shows %s once as %s', (tier, label) => {
    render(<PlanName tier={tier} />);

    expect(screen.getAllByText(label)).toHaveLength(1);
    expect(screen.queryByText(tier)).toBeNull();
  });

  it('shows an unknown tier once, without a second badge', () => {
    const { container } = render(<PlanName tier="CUSTOM" />);

    expect(screen.getAllByText('CUSTOM')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="badge"]')).toHaveLength(1);
  });
});
