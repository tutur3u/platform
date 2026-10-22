import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

const { received } = vi.hoisted(() => ({ received: vi.fn() }));
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useLocation: () => '/en/login',
}));
vi.mock('./app-providers', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@tuturuuu/ui/custom/app-error-boundary', () => ({
  AppErrorBoundary: (props: { error: Error }) => {
    received(props.error);
    return <span>fallback</span>;
  },
}));

import { ErrorPage } from './router-shell';

afterEach(() => vi.restoreAllMocks());
it('the real Meet error boundary captures its closed phase and retains the original Error', () => {
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = new TypeError('SECRET');
  expect(renderToString(<ErrorPage error={original} reset={() => {}} />)).toBe(
    '<span>fallback</span>'
  );
  expect(received).toHaveBeenCalledWith(original);
  const lines = sink.mock.calls.flat().join('\n');
  expect(lines).toContain('"phase":"render-boundary"');
  expect(lines).toContain('"kind":"error"');
  expect(lines).not.toContain('SECRET');
});
it('diagnostic sink failure preserves the existing fallback', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {
    throw Error('sink');
  });
  const original = new Error('SECRET');
  expect(renderToString(<ErrorPage error={original} reset={() => {}} />)).toBe(
    '<span>fallback</span>'
  );
  expect(received).toHaveBeenCalledWith(original);
});
