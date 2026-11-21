// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement as h, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./providers', () => ({
  AppProviders: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('./page-loader', () => ({ loadMailPage: vi.fn() }));
vi.mock('./page-view', () => ({ PageView: () => null }));
vi.mock('./page-head', () => ({ mailPageHead: () => ({}) }));

import { Route as IndexRoute } from '../routes/index';
import { Route as SplatRoute } from '../routes/$';
import { MailPendingPage, mailPendingOptions } from './route-pending';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each([
  ['/$', SplatRoute],
  ['/', IndexRoute],
])(
  'route %s shows the shared skeleton while its loader is pending',
  (_id, route) => {
    expect(route.options.pendingComponent).toBe(MailPendingPage);
    expect(route.options.pendingMs).toBe(mailPendingOptions.pendingMs);
    expect(route.options.pendingMinMs).toBe(mailPendingOptions.pendingMinMs);
  }
);

it('replaces a slow navigation with the skeleton, then the page after the minimum', async () => {
  let finish: (value: string) => void = () => undefined;
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => h('p', null, 'home'),
  });
  const inbox = createRoute({
    getParentRoute: () => root,
    path: '/inbox',
    ...mailPendingOptions,
    loader: () => new Promise<string>((resolve) => (finish = resolve)),
    component: () => h('p', null, 'inbox page'),
  });
  const router = createRouter({
    routeTree: root.addChildren([home, inbox]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await act(async () => {
    render(h(RouterProvider, { router }));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('home')).not.toBeNull();
  await act(async () => {
    router.history.push('/inbox');
    await vi.advanceTimersByTimeAsync(mailPendingOptions.pendingMs - 1);
  });
  expect(screen.queryByRole('status')).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(
    screen.getByRole('status', { name: 'loading' }).getAttribute('aria-busy')
  ).toBe('true');
  await act(async () => {
    finish('done');
    await vi.advanceTimersByTimeAsync(mailPendingOptions.pendingMinMs - 1);
  });
  expect(screen.queryByText('inbox page')).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByText('inbox page')).not.toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
