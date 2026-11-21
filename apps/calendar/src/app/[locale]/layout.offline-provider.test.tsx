// @vitest-environment node
import { OfflineProvider } from '@tuturuuu/offline/provider';
import { Children, isValidElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import RootLayout from './layout';

vi.mock('@tuturuuu/offline/provider', () => ({ OfflineProvider: () => null }));
vi.mock('@tuturuuu/ui/custom/production-indicator', () => ({
  ProductionIndicator: () => null,
}));
vi.mock('@tuturuuu/ui/custom/staff-toolbar', () => ({
  StaffToolbar: () => null,
}));
vi.mock('@tuturuuu/ui/custom/tailwind-indicator', () => ({
  TailwindIndicator: () => null,
}));
vi.mock('@tuturuuu/ui/pwa-status', () => ({ PwaStatus: () => null }));
vi.mock('@tuturuuu/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/fade-setting-initializer', () => ({
  FadeSettingInitializer: () => null,
}));
vi.mock('@tuturuuu/utils/common/nextjs', () => ({
  font: { className: '' },
  generateCommonMetadata: vi.fn(),
  viewport: {},
}));
vi.mock('@tuturuuu/utils/format', () => ({ cn: () => '' }));
vi.mock('@tuturuuu/utils/i18n-root-locale', () => ({
  resolveRootLocale: async () => 'en',
}));
vi.mock('next/root-params', () => ({ locale: async () => 'en' }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('nuqs/adapters/next/app', () => ({ NuqsAdapter: () => null }));
vi.mock('@/components/providers', () => ({ Providers: () => null }));
vi.mock('@/constants/configs', () => ({ siteConfig: { name: 'Calendar' } }));
vi.mock('@/i18n/routing', () => ({ supportedLocales: ['en'] }));

it('gives the actual Next layout a Calendar-scoped worker registration', async () => {
  const tree = await RootLayout({
    children: <span>Calendar child</span>,
    params: Promise.resolve({ locale: 'en' }),
  });
  const registrations: unknown[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (
        !isValidElement<{
          children?: ReactNode;
          swUrl?: string;
          options?: { scope: string };
        }>(child)
      )
        return;
      if (child.type === OfflineProvider)
        registrations.push({
          swUrl: child.props.swUrl,
          options: child.props.options,
        });
      visit(child.props.children);
    });
  }
  visit(tree);
  expect(registrations).toEqual([
    { swUrl: '/calendar/serwist/sw.js', options: { scope: '/calendar/' } },
  ]);
});
