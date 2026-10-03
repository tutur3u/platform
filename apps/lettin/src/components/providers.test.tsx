// @vitest-environment jsdom

import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { parseAsString, useQueryState } from 'nuqs';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { Providers } from './providers';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/satellite/client-providers', () => ({
  ClientProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
function ShellQueryProbe() {
  const [settings] = useQueryState('settings', parseAsString);
  return <output>{settings}</output>;
}
it('provides the real Next Nuqs adapter to shared shell query-state consumers', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const router = {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    bfcacheId: 'test',
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        <AppRouterContext.Provider value={router}>
          <PathnameContext.Provider value="/workspace/wiki">
            <SearchParamsContext.Provider
              value={new URLSearchParams('settings=profile')}
            >
              <Providers>
                <ShellQueryProbe />
              </Providers>
            </SearchParamsContext.Provider>
          </PathnameContext.Provider>
        </AppRouterContext.Provider>
      )
    );
    expect(container.querySelector('output')?.textContent).toBe('profile');
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

it('ships both shared shell message namespaces in English and Vietnamese', () => {
  for (const messages of [en, viMessages]) {
    expect(messages.notifications['no-notifications']).toBeTruthy();
    expect(messages.notifications.notifications).toBeTruthy();
    expect(messages['nav-upgrade-dialog'].rollout_notice).toBeTruthy();
    expect(messages['nav-upgrade-dialog'].contact_support).toBeTruthy();
  }
});
