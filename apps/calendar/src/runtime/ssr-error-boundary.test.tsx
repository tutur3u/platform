// @vitest-environment node
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => 'en',
  HeadContent: () => null,
  Scripts: () => null,
}));
vi.mock('./app-providers', () => ({
  AppProviders: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@tuturuuu/ui/custom/app-error-boundary', () => ({
  AppErrorBoundary: ({ error }: { error: Error }) => {
    ports.error(error);
    return <main>same fallback</main>;
  },
}));

import { CalendarError } from './router-shell';

afterEach(() => vi.restoreAllMocks());
it('captures server error-boundary category without changing fallback or error identity', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new TypeError('PRIVATE_SENTINEL');
  expect(renderToString(<CalendarError error={error} reset={() => {}} />)).toBe(
    '<main>same fallback</main>'
  );
  expect(ports.error).toHaveBeenCalledWith(error);
  expect(log).toHaveBeenCalledWith('calendar-ssr-error category=TYPE_ERROR');
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SENTINEL');
});
