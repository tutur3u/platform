import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ locale: vi.fn(), page: vi.fn() }));
vi.mock('./page-loader', () => ({
  loadCalendarLocale: transport.locale,
  loadCalendarPage: transport.page,
}));
vi.mock('./app-providers', () => ({
  AppProviders: ({
    locale,
    children,
  }: {
    locale: string;
    children: ReactNode;
  }) => <section data-provider-locale={locale}>{children}</section>,
}));
vi.mock('./page-view', () => ({ PageView: () => <div>Calendar view</div> }));
vi.mock('@tuturuuu/ui/custom/app-error-boundary', () => ({
  AppErrorBoundary: () => <div>Calendar error</div>,
}));

import { getRouter } from '../router';

beforeEach(() => {
  vi.resetAllMocks();
  transport.locale.mockResolvedValue('vi');
  transport.page.mockResolvedValue({
    kind: 'verify-token',
    locale: 'vi',
    params: { locale: 'vi' },
    showVersionBadge: false,
  });
});
async function routerAt(path: string) {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return router;
}
describe('root resolved locale context', () => {
  it('sets document lang from resolved Vietnamese on an unprefixed document', async () => {
    const router = await routerAt('/personal');
    const markup = renderToString(<RouterProvider router={router} />);
    expect(markup).toContain('lang="vi"');
    expect(markup).toContain('data-provider-locale="vi"');
    expect(transport.locale).toHaveBeenCalledWith({
      data: { path: '/personal' },
    });
  });
  it('retains resolved locale across native navigation and refresh/invalidation', async () => {
    const router = await routerAt('/personal');
    await router.navigate({ to: '/personal/tasks' });
    await router.invalidate();
    const markup = renderToString(<RouterProvider router={router} />);
    expect(markup).toContain('lang="vi"');
    expect(markup).toContain('data-provider-locale="vi"');
    expect(transport.locale.mock.calls.length).toBeGreaterThan(1);
    expect(transport.page.mock.calls.at(-1)?.[0]).toEqual({
      data: { path: '/personal/tasks' },
    });
  });
  it('uses the root resolved locale when child data loading fails', async () => {
    transport.page.mockRejectedValue(new Error('page unavailable'));
    const router = await routerAt('/personal');
    const markup = renderToString(<RouterProvider router={router} />);
    expect(markup).toContain('lang="vi"');
    expect(markup).toContain('data-provider-locale="vi"');
    expect(markup).toContain('Calendar error');
  });
  it('does not force Vietnamese when the resolved preference is English', async () => {
    transport.locale.mockResolvedValue('en');
    transport.page.mockResolvedValue({
      kind: 'verify-token',
      locale: 'en',
      params: { locale: 'en' },
      showVersionBadge: false,
    });
    const router = await routerAt('/personal');
    const markup = renderToString(<RouterProvider router={router} />);
    expect(markup).toContain('lang="en"');
    expect(markup).toContain('data-provider-locale="en"');
  });
  it('refreshes the root context when the resolved locale preference changes', async () => {
    const router = await routerAt('/personal');
    transport.locale.mockResolvedValue('en');
    transport.page.mockResolvedValue({
      kind: 'verify-token',
      locale: 'en',
      params: { locale: 'en' },
      showVersionBadge: false,
    });
    await router.invalidate();
    const markup = renderToString(<RouterProvider router={router} />);
    expect(markup).toContain('lang="en"');
    expect(markup).toContain('data-provider-locale="en"');
  });
});
