import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
  usePathname: vi.fn(() => '/internal'),
  useRouter: vi.fn(() => ({
    back: vi.fn(),
    forward: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  })),
}));

vi.mock('@/components/providers', () => ({
  Providers: ({
    appName,
    children,
  }: {
    appName: string;
    children: ReactNode;
  }) => (
    <section data-app-name={appName} data-testid="satellite-provider">
      {children}
    </section>
  ),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: (...args: Parameters<typeof mocks.setRequestLocale>) =>
    mocks.setRequestLocale(...args),
}));

vi.mock('@tuturuuu/ui/custom/production-indicator', () => ({
  ProductionIndicator: () => null,
}));

vi.mock('@tuturuuu/ui/custom/staff-toolbar', () => ({
  StaffToolbar: () => null,
}));

vi.mock('@tuturuuu/ui/custom/tailwind-indicator', () => ({
  TailwindIndicator: () => null,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  Toaster: () => null,
}));

vi.mock('@tuturuuu/utils/common/nextjs', () => ({
  font: { className: 'test-font' },
  generateCommonMetadata: vi.fn(),
  viewport: {},
}));

vi.mock('@tuturuuu/utils/format', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

vi.mock('@tuturuuu/vercel', () => ({
  VercelAnalytics: () => null,
  VercelInsights: () => null,
}));

describe('Infrastructure locale layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the shared satellite provider for dashboard client components', async () => {
    const Layout = (await import('./layout')).default;

    const result = await Layout({
      children: <div>dashboard child</div>,
      params: Promise.resolve({ locale: 'en' }),
    });

    render(result);

    expect(mocks.setRequestLocale).toHaveBeenCalledWith('en');
    expect(screen.getByTestId('satellite-provider')).toHaveAttribute(
      'data-app-name',
      'Tuturuuu Infra'
    );
    expect(screen.getByTestId('satellite-provider')).toHaveTextContent(
      'dashboard child'
    );
  });

  it('rejects unsupported locales before mounting the provider', async () => {
    const Layout = (await import('./layout')).default;

    await expect(
      Layout({
        children: <div>dashboard child</div>,
        params: Promise.resolve({ locale: 'fr' }),
      })
    ).rejects.toThrow('not-found');

    expect(mocks.notFound).toHaveBeenCalled();
    expect(mocks.setRequestLocale).not.toHaveBeenCalled();
  });
});
