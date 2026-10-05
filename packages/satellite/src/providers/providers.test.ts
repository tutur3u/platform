import { readFileSync } from 'node:fs';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connection: vi.fn(), session: vi.fn() }));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('../auth', () => ({ getSatelliteAppSessionUser: mocks.session }));
vi.mock('./client-providers', () => ({ ClientProviders: () => null }));
vi.mock('../components/version-badge-gate', () => ({
  SatelliteVersionBadge: () => null,
}));
vi.mock('@tuturuuu/utils/launchable-apps', () => ({
  getLaunchableAppByTitle: () => undefined,
}));
vi.mock('next-intl', () => ({ NextIntlClientProvider: () => null }));
vi.mock('next-themes', () => ({ ThemeProvider: () => null }));

import { Providers } from './providers';

type ChildrenElement = ReactElement<{ children: ReactNode }>;

function verifiedProvider() {
  const theme = Providers({ children: 'content', currentApp: 'tasks' });
  const suspense = theme.props.children as ChildrenElement;
  const intl = suspense.props.children as ChildrenElement;
  return intl.props.children as ReactElement<{
    children: ReactNode;
    currentApp: 'tasks';
  }>;
}

async function runVerifiedProvider() {
  const element = verifiedProvider();
  const render = element.type as (
    props: typeof element.props
  ) => Promise<
    ReactElement<{ actorId?: string; currentApp: string; children: ReactNode }>
  >;
  return render(element.props);
}

const source = readFileSync('src/providers/providers.tsx', 'utf8');

describe('satellite providers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.session.mockResolvedValue({ id: 'actor-1' });
  });

  it('waits for request-time rendering before time-sensitive session verification', async () => {
    let release!: () => void;
    mocks.connection.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    const pending = runVerifiedProvider();
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.session).not.toHaveBeenCalled();
    release();
    const rendered = await pending;
    expect(mocks.session).toHaveBeenCalledWith('tasks');
    expect(rendered.props.actorId).toBe('actor-1');
    expect(rendered.props.currentApp).toBe('tasks');
  });

  it('does not resolve a session when the request boundary rejects', async () => {
    mocks.connection.mockRejectedValue(new Error('request unavailable'));
    await expect(runVerifiedProvider()).rejects.toThrow('request unavailable');
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('keeps runtime i18n resolution inside suspense and theme setup outside', () => {
    const themeProvider = source.indexOf('<ThemeProvider');
    const suspense = source.indexOf('<Suspense ');
    const intlProvider = source.indexOf('<NextIntlClientProvider>');
    const intlProviderEnd = source.indexOf('</NextIntlClientProvider>');
    const suspenseEnd = source.lastIndexOf('</Suspense>');
    const themeProviderEnd = source.indexOf('</ThemeProvider>');

    expect(themeProvider).toBeGreaterThan(-1);
    expect(themeProvider).toBeLessThan(suspense);
    expect(suspense).toBeLessThan(intlProvider);
    expect(intlProvider).toBeLessThan(intlProviderEnd);
    expect(intlProviderEnd).toBeLessThan(suspenseEnd);
    expect(suspenseEnd).toBeLessThan(themeProviderEnd);
  });
});
